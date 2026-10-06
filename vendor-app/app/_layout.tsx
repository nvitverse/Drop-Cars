import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { setupNotificationListeners } from '@/services/notificationListeners';
import WebAlertHost, { installWebAlert } from '@/components/WebAlertHost';
import { installWebStyleFixes } from '@/utils/webStyleFixes';
import { LanguageProvider } from '@/contexts/LanguageContext';

// react-native-web's Alert.alert is a no-op - patch it before any screen can
// call Alert.alert (sign-in errors, validation, etc. all rely on it). No-op
// on native, which already has a working Alert.
installWebAlert();
// Fixes icons (Phone, Lock, etc.) rendering at 0 width on web - see the
// function's own comment for the full root cause.
installWebStyleFixes();

export default function RootLayout() {
  useFrameworkReady();

  useEffect(() => {
    const { receivedListener, responseListener } = setupNotificationListeners();
    return () => {
      receivedListener.remove();
      responseListener.remove();
    };
  }, []);

  return (
    <LanguageProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="+not-found" />
      </Stack>
      <StatusBar style="auto" />
      <WebAlertHost />
    </LanguageProvider>
  );
}
