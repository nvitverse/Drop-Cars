import { useEffect } from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider } from '@/contexts/AuthContext';
import { BookingProvider } from '@/contexts/BookingContext';
import { WalletProvider } from '@/contexts/WalletContext';
import * as Notifications from 'expo-notifications';
import WebAlertHost, { installWebAlert } from '@/components/WebAlertHost';
import OtaUpdateGate from '@/components/OtaUpdateGate';
import { installWebStyleFixes } from '@/utils/webStyleFixes';

import { ServiceModeProvider } from '@/contexts/ServiceModeContext';
import { TaxiFlowProvider } from '@/contexts/TaxiFlowContext';
import { CarPoolProvider } from '@/contexts/CarPoolContext';
import { ThemePreferenceProvider } from '@/contexts/ThemePreferenceContext';

// react-native-web's Alert.alert is a no-op - patch it before any screen can
// call Alert.alert (booking confirms, OTP errors, etc. all rely on it).
// No-op on native, which already has a working Alert.
installWebAlert();
// Fixes icons (Phone, Mail, etc.) rendering at 0 width on web - see the
// function's own comment for the full root cause.
installWebStyleFixes();

// Hold the splash screen until the real Inter font files below are loaded -
// same pattern already used by the Admin and Driver apps, so the whole
// platform stops relying on the browser/OS's synthetic-bold system font
// (the actual cause of text looking heavy/blurry instead of crisp).
SplashScreen.preventAutoHideAsync().catch(() => {});

// Configure notifications
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

export default function RootLayout() {
  useFrameworkReady();

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': require('../assets/fonts/Inter-Regular.ttf'),
    'Inter-Medium': require('../assets/fonts/Inter-Medium.ttf'),
    'Inter-SemiBold': require('../assets/fonts/Inter-SemiBold.ttf'),
    'Inter-Bold': require('../assets/fonts/Inter-Bold.ttf'),
    'Inter-ExtraBold': require('../assets/fonts/Inter-ExtraBold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync().catch(() => {});
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      const styleId = 'global-hide-scrollbar-style';
      if (!document.getElementById(styleId)) {
        const styleElement = document.createElement('style');
        styleElement.id = styleId;
        styleElement.textContent = `
          /* Hide scrollbars globally across all web browsers */
          * {
            -ms-overflow-style: none !important;
            scrollbar-width: none !important;
            -webkit-overflow-scrolling: touch !important;
          }
          *::-webkit-scrollbar {
            display: none !important;
            width: 0px !important;
            height: 0px !important;
            background: transparent !important;
          }
          html, body, #root, [data-reactroot] {
            scroll-behavior: smooth !important;
            -webkit-overflow-scrolling: touch !important;
            overscroll-behavior-y: contain;
          }
        `;
        document.head.appendChild(styleElement);
      }
    }
    registerForPushNotificationsAsync();
  }, []);

  const registerForPushNotificationsAsync = async () => {
    try {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      
      if (finalStatus !== 'granted') {
        console.log('Failed to get push token for push notification!');
        return;
      }
    } catch (e) {
      console.log('Notification permission check ignored in web mode');
    }
  };

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <ThemePreferenceProvider>
      <AuthProvider>
        <BookingProvider>
          <WalletProvider>
            <ServiceModeProvider>
              <TaxiFlowProvider>
                <CarPoolProvider>
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="(customer)" />
                    <Stack.Screen name="auth" />
                    <Stack.Screen name="(vendor)" />
                    <Stack.Screen name="(driver)" />
                    <Stack.Screen name="+not-found" />
                  </Stack>
                  <StatusBar style="auto" />
                  <WebAlertHost />
                  <OtaUpdateGate />
                </CarPoolProvider>
              </TaxiFlowProvider>
            </ServiceModeProvider>
          </WalletProvider>
        </BookingProvider>
      </AuthProvider>
    </ThemePreferenceProvider>
  );
}