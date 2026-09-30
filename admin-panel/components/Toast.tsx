import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Animated, StyleSheet, Text } from 'react-native';
import { colors } from '@/constants/theme';

type ToastType = 'success' | 'error' | 'info';

interface ToastState {
  visible: boolean;
  message: string;
  type: ToastType;
}

// Lightweight inline toast/snackbar for non-blocking success/info feedback
// (e.g. "Status updated") - NOT meant to replace Alert.alert confirmation
// dialogs (Yes/No prompts), only the fire-and-forget success messages that
// currently interrupt the user with a blocking native alert.
export function useToast() {
  const [state, setState] = useState<ToastState>({ visible: false, message: '', type: 'success' });
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: ToastType = 'success') => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setState({ visible: true, message, type });
    timerRef.current = setTimeout(() => {
      setState((s) => ({ ...s, visible: false }));
    }, 2200);
  }, []);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return { toast: state, showToast };
}

interface ToastProps {
  visible: boolean;
  message: string;
  type?: ToastType;
}

export default function Toast({ visible, message, type = 'success' }: ToastProps) {
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(opacity, {
      toValue: visible ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [visible, opacity]);

  const bg = type === 'success' ? colors.success : type === 'error' ? colors.error : colors.primary;

  return (
    <Animated.View pointerEvents="none" style={[styles.container, { backgroundColor: bg, opacity }]}>
      <Text style={styles.text} numberOfLines={2}>{message}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 24,
    left: 20,
    right: 20,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
    zIndex: 1000,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
});
