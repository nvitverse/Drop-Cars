import { useEffect, useState } from 'react';
import { router } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import AppLoadingScreen from '@/components/AppLoadingScreen';
import LanguageSelectScreen, { HAS_SEEN_LANGUAGE_SELECT_KEY } from '@/components/LanguageSelectScreen';
import { fetchVendorStatus, routeForActiveVendor } from '@/utils/vendorSession';

export default function Index() {
  // Shown once, on the very first launch, before the normal auth-check
  // redirect below runs. Skippable - either path (pick a language or Skip)
  // marks HAS_SEEN_LANGUAGE_SELECT_KEY and falls through to checkAuthStatus.
  const [showLanguageSelect, setShowLanguageSelect] = useState(false);

  useEffect(() => {
    checkLanguageSelection();
  }, []);

  const checkLanguageSelection = async () => {
    try {
      const seen = await AsyncStorage.getItem(HAS_SEEN_LANGUAGE_SELECT_KEY);
      if (seen) {
        checkAuthStatus();
      } else {
        setShowLanguageSelect(true);
      }
    } catch {
      checkAuthStatus();
    }
  };

  const handleLanguageSelectDone = () => {
    setShowLanguageSelect(false);
    checkAuthStatus();
  };

  const checkAuthStatus = async () => {
    try {
      await new Promise((r) => setTimeout(r, 900));     // let the opening picture be seen, never a flash
      const userSession = await AsyncStorage.getItem('accessToken');
      if (!userSession) {
        router.replace('/(auth)/sign-in');
        return;
      }
      // A stored token is not enough: a vendor who is still waiting for approval (or was switched off) must land on the status page,
      // not on a home screen whose every request fails.
      const me = await fetchVendorStatus();
      if (!me) {
        // offline / server busy: let a previously approved vendor in; the screens show their own retry
        router.replace('/(tabs)');
      } else if (me.status === 'ACTIVE') {
        router.replace((await routeForActiveVendor()) as any);
      } else if (me.status === 'PENDING') {
        router.replace('/(auth)/account-status?status=Pending');
      } else {
        router.replace('/(auth)/account-status?status=INACTIVE');
      }
    } catch (error) {
      router.replace('/(auth)/sign-in');
    }
  };

  if (showLanguageSelect) {
    return <LanguageSelectScreen onDone={handleLanguageSelectDone} />;
  }

  return <AppLoadingScreen />;
}
