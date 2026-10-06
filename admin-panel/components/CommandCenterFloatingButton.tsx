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
          backgroundColor: '#2563EB',
          shadowColor: '#2563EB',
        },
      ]}
      accessibilityLabel="Open Assistant"
    >
      <Bot size={22} color="#FFFFFF" />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  floatingContainer: {
    position: 'absolute',
    bottom: 145,
    right: 18,
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    zIndex: 9998,
  },
});
