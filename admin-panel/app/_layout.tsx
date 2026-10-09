import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import WebAlertHost, { installWebAlert } from '@/components/WebAlertHost';
import EnquiryAlarmHost from '@/components/EnquiryAlarmHost';
import { KeyboardSafeView } from '@/components/KeyboardSafe';
import BookingAlarmHost from '@/components/BookingAlarmHost';
import AlarmDutyGate from '@/components/AlarmDutyGate';
import { installWebStyleFixes } from '@/utils/webStyleFixes';
import UpdateGate from '@/components/UpdateGate';

import { ThemeProvider } from '@/context/ThemeContext';
import { StaffDutyProvider } from '@/context/StaffDutyContext';
import StaffDutyFloatingBubble from '@/components/StaffDutyFloatingBubble';
import { CommandCenterProvider } from '@/context/CommandCenterContext';
import CommandCenterModal from '@/components/CommandCenterModal';

SplashScreen.preventAutoHideAsync();

// react-native-web's Alert.alert is a no-op - patch it before any screen can
// call Alert.alert (login errors, validation, etc. all rely on it). No-op
// on native, which already has a working Alert.
installWebAlert();
// Fixes icons rendering at 0 width on web - see the function's own comment
// for the full root cause.
installWebStyleFixes();

export default function RootLayout() {
  useFrameworkReady();

  // Same Inter family the Driver App already uses (local .ttf copies in
  // assets/fonts, not the npm package, to avoid a new dependency) - gives
  // the Dashboard hero numbers and headers real typographic weight instead
  // of relying on the system font everywhere.
  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('../assets/fonts/Inter-Medium.ttf'),
    'Inter-SemiBold': require('../assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Bold': require('../assets/fonts/Inter-Bold.ttf'),
    'Inter-ExtraBold': require('../assets/fonts/Inter-ExtraBold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // The newest live update is checked at launch and whenever the app comes back to the front, downloaded in a visible
  // "Updating..." box and applied by restarting (components/UpdateGate.tsx) - it used to happen silently and a failure was invisible.

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <StaffDutyProvider>
            <CommandCenterProvider>
              <KeyboardSafeView>
                {/* Screens glide in from the right and the previous one eases away (instead of snapping); the tab shell and login just fade. */}
                <Stack screenOptions={{ headerShown: false, animation: 'slide_from_right', animationDuration: 260, gestureEnabled: true }}>
                  <Stack.Screen name="(tabs)" options={{ animation: 'fade', animationDuration: 200 }} />
                  <Stack.Screen name="login" options={{ animation: 'fade', animationDuration: 200 }} />
                  <Stack.Screen name="+not-found" />
                </Stack>
              </KeyboardSafeView>
              <StatusBar style="auto" />
              <WebAlertHost />
              {/* Alarms paused temporarily as requested to work freely in other sections */}
              <AlarmDutyGate />
              <UpdateGate />
              <EnquiryAlarmHost />
              <BookingAlarmHost />
              <StaffDutyFloatingBubble />
              {/* The Command Centre floating button is gone: it opens from Chats > Command Centre */}
              <CommandCenterModal />
            </CommandCenterProvider>
          </StaffDutyProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
