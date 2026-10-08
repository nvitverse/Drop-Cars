import { useEffect } from 'react';
import '@/utils/quietConsole';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFrameworkReady } from '@/hooks/useFrameworkReady';
import { AuthProvider } from '@/contexts/AuthContext';
import { WalletProvider } from '@/contexts/WalletContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { LanguageProvider } from '@/contexts/LanguageContext';
import { DashboardProvider } from '@/contexts/DashboardContext';
import { NotificationProvider } from '@/contexts/NotificationContext';
import { BubbleProvider } from '@/contexts/BubbleContext';
import { CarDriverProvider, useCarDriver } from '@/contexts/CarDriverContext';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'expo-router';
import { onSessionExpired } from '@/utils/session';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import * as SplashScreen from 'expo-splash-screen';
// Initialize notifications on app startup (CRITICAL FIX)
import { setupNotificationListeners } from '@/services/notifications/notificationService';
import WebAlertHost, { installWebAlert } from '@/components/WebAlertHost';
import OtaUpdateGate from '@/components/OtaUpdateGate';
import ForceUpdateGate from '@/components/ForceUpdateGate';
import { installUiTranslation } from '@/utils/uiTranslate';

installUiTranslation(); // every on-screen English text goes through the language dictionary
import { installWebStyleFixes } from '@/utils/webStyleFixes';
import LanguageToggle from '@/components/LanguageToggle';

function GlobalSessionListener() {
  const { logout } = useAuth();
  const { clearAllData } = useCarDriver();

  useEffect(() => {
    const off = onSessionExpired(async (reason) => {
      console.log('🔴 Session expired globally:', reason);
      try {
        await logout();
      } catch (e) {}
      try {
        clearAllData();
      } catch (e) {}
    });
    return () => off();
  }, [logout, clearAllData]);

  return null;
}

SplashScreen.preventAutoHideAsync();

// react-native-web's Alert.alert is a no-op - patch it before any screen can
// call Alert.alert (login errors, validation, etc. all rely on it). No-op on
// native, which already has a working Alert.
installWebAlert();
// Fixes icons (Smartphone, Lock, etc.) rendering at 0 width on web - see the
// function's own comment for the full root cause.
installWebStyleFixes();

export default function RootLayout() {
  useFrameworkReady();

  const [fontsLoaded, fontError] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
  });

  useEffect(() => {
    if (fontsLoaded || fontError) {
      SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  // Initialize notification listeners on app startup (CRITICAL FIX)
  useEffect(() => {
    console.log('🚀 APP START: Setting up notification listeners...');
    const listeners = setupNotificationListeners();
    
    // Cleanup listeners on unmount
    return () => {
      if (listeners.receivedListener) {
        listeners.receivedListener.remove();
      }
      if (listeners.responseListener) {
        listeners.responseListener.remove();
      }
    };
  }, []);

  if (!fontsLoaded && !fontError) {
    return null;
  }
//Successfull Preview Build without nativ directory(done in cloud expo)
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <LanguageProvider>
      <ThemeProvider>
          <AuthProvider>
            <WalletProvider>
              <DashboardProvider>
                <NotificationProvider>
                  <BubbleProvider>
                  <CarDriverProvider>
                  <GlobalSessionListener />
                  <Stack screenOptions={{ headerShown: false }}>
                    <Stack.Screen name="index" />
                    <Stack.Screen name="login" />
                    <Stack.Screen name="signup" />
                    <Stack.Screen name="quick-login" />
                    <Stack.Screen name="(tabs)" />
                    <Stack.Screen name="car-driver" />
                    <Stack.Screen name="bubble-tap" />
                    <Stack.Screen name="+not-found" />
                  </Stack>
                  <StatusBar style="auto" />
                  <WebAlertHost />
                  <OtaUpdateGate />
                  <ForceUpdateGate app="driver" />
                  </CarDriverProvider>
                  </BubbleProvider>
                </NotificationProvider>
              </DashboardProvider>
            </WalletProvider>
          </AuthProvider>
      </ThemeProvider>
      </LanguageProvider>
    </GestureHandlerRootView>
  );
}