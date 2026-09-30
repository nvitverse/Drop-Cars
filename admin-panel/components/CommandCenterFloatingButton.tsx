import React, { useEffect, useState } from 'react';
import { StyleSheet, TouchableOpacity, View } from 'react-native';
import { Bot, Mic } from 'lucide-react-native';
import { usePathname } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCommandCenter } from '@/context/CommandCenterContext';
import { useTheme } from '@/context/ThemeContext';

export default function CommandCenterFloatingButton() {
  const { openCommandCenter, isOpen } = useCommandCenter();
  const { isDark } = useTheme();
  const pathname = usePathname();
  const [hasToken, setHasToken] = useState(false);

  useEffect(() => {
    AsyncStorage.getItem('auth_token').then((tok) => {
      setHasToken(!!tok);
    });
  }, [pathname]);

  // NEVER show on login screen or if unauthenticated
  if (isOpen || !pathname || pathname === '/login' || pathname.includes('login') || !hasToken) {
    return null;
  }

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={openCommandCenter}
      style={[
        styles.floatingContainer,
        {
          backgroundColor: '#6366F1',
          shadowColor: '#6366F1',
        },
      ]}
      accessibilityLabel="Open Assistant"
    >
      <Bot size={20} color="#FFFFFF" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    // This button lives at the ROOT layout (above the tab bar), while the
    // per-screen round "+" FAB (Home, Bookings) lives INSIDE the tab
    // content area, whose own "position:absolute; bottom:24" is measured
    // from the top of the tab bar, not the true screen bottom. On a ~58-60px
    // tab bar that puts the "+" FAB's real bottom offset around ~82px from
    // the true screen edge - only ~10px below this button's old bottom:92,
    // so the two nearly fully overlapped (found 2026-09-29, comparing their
    // live getBoundingClientRect on the web preview - both had the same
    // top). 150 clears the "+" FAB (its 52px height + ~82px offset) with a
    // safe gap regardless of tab bar height across devices.
    bottom: 150,
    right: 16,
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    zIndex: 9998,
  },
});
