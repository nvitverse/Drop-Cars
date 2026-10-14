import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { setupNotificationListeners } from '@/services/notificationListeners';
import WebAlertHost, { installWebAlert } from '@/components/WebAlertHost';
import { installWebStyleFixes } from '@/utils/webStyleFixes';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { KeyboardSafeView } from '@/components/KeyboardSafe';
import { GlobalErrorBoundary } from '@/components/GlobalErrorBoundary';
import UpdateGate from '@/components/UpdateGate';

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
    <GlobalErrorBoundary>
      <LanguageProvider>
        {/* KeyboardSafeView lifts the whole screen above the keyboard once, so no typing box is ever hidden (same as the Admin App). */}
        <KeyboardSafeView>
          <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', animationDuration: 240, gestureEnabled: true }}>
            <Stack.Screen name="+not-found" />
          </Stack>
        </KeyboardSafeView>
        <StatusBar style="auto" />
        <WebAlertHost />
        <UpdateGate />
      </LanguageProvider>
    </GlobalErrorBoundary>
  );
}
