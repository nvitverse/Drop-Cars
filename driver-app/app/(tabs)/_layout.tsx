import { setForegroundInterval } from '@/utils/foregroundInterval';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useEffect, useState } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { Chrome as Home, Navigation, Zap, IdCard, Briefcase, MessageCircle } from 'lucide-react-native';
import { Alert, Platform } from 'react-native';
import * as SecureStore from '@/utils/secureStore';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCarDriver } from '@/contexts/CarDriverContext';
import { useLanguage } from '@/contexts/LanguageContext';
import ProfilePhotoReminder from '@/components/ProfilePhotoReminder';
import OverlayPermissionPrompt from '@/components/OverlayPermissionPrompt';
import AppLoadingScreen from '@/components/AppLoadingScreen';
import axiosDriver from '@/app/api/axiosDriver';

// Total unread across booking chats + the general Support thread - polled
// here (not inside chats.tsx) so the Chat tab shows a badge even when the
// driver hasn't opened Chats yet. Both calls are side-effect-free (neither
// marks anything as read just by fetching).
function useUnreadChatCount(enabled: boolean) {
  const [count, setCount] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled) return;
    try {
      const [threadsRes, supportRes] = await Promise.all([
        axiosDriver.get('/api/booking-chat/threads').catch(() => ({ data: [] })),
        axiosDriver.get('/api/support/my-unread-count').catch(() => ({ data: { unread: 0 } })),
      ]);
      const bookingUnread = Array.isArray(threadsRes.data)
        ? threadsRes.data.reduce((sum: number, t: any) => sum + (t.unread || 0), 0)
        : 0;
      setCount(bookingUnread + (supportRes.data?.unread || 0));
    } catch {}
  }, [enabled]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return;
      refresh();
      const stop = setForegroundInterval(refresh, 20000);
      return stop;
    }, [enabled, refresh])
  );

  return count;
}

export default function TabLayout() {
  const { colors } = useTheme();
  const router = useRouter();
  const { user, setUser, isLoading } = useAuth();
  const { signinAsOwner } = useCarDriver();
  const { t } = useLanguage();
  const [authReady, setAuthReady] = useState(false);
  const unreadChats = useUnreadChatCount(authReady);
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 12 : 8);

  useEffect(() => {
    if (isLoading) return;
    let active = true;

    const checkOwnerSession = async () => {
      try {
        const [ownerToken, ownerData] = await Promise.all([
          SecureStore.getItemAsync('authToken'),
          SecureStore.getItemAsync('userData'),
        ]);
        if (!active) return;

        if (ownerToken && ownerData) {
          if (!user) setUser(JSON.parse(ownerData));
          setAuthReady(true);
          return;
        }

        setAuthReady(false);
        await Promise.all([
          SecureStore.deleteItemAsync('authToken'),
          SecureStore.deleteItemAsync('userData'),
          SecureStore.deleteItemAsync('loginResponse'),
          SecureStore.deleteItemAsync('ownerLastLogin'),
        ]);
        if (!active) return;

        const [driverToken, driverInfo] = await Promise.all([
          SecureStore.getItemAsync('driverAuthToken'),
          SecureStore.getItemAsync('driverAuthInfo'),
        ]);
        router.replace(driverToken && driverInfo ? '/quick-dashboard' : '/login');
      } catch {
        if (active) router.replace('/login');
      }
    };

    void checkOwnerSession();
    return () => {
      active = false;
    };
  }, [isLoading, user, setUser, router]);

  const isOwnerSession = authReady && !!user;

  if (!authReady) return <AppLoadingScreen />;

  const handleDutyPress = async () => {
    try {
      await signinAsOwner();
      router.push('/car-driver/dashboard' as any);
    } catch (error: any) {
      const message: string = error?.message || '';
      if (message.toLowerCase().includes('not registered as a duty driver')) {
        if (Platform.OS === 'web') {
          alert('Add yourself as a duty driver first (using your own Aadhaar/licence), then Duty will open your own bookings.');
        } else {
          Alert.alert(
            'Set Up Your Duty Driver Profile',
            'Add yourself as a duty driver first (using your own Aadhaar/licence) so you can accept and run bookings yourself.',
            [{ text: 'Set Up Now', onPress: () => router.push('/add-driver?mode=own' as any) }, { text: 'Cancel', style: 'cancel' }],
          );
          return;
        }
        router.push('/add-driver?mode=own' as any);
      } else if (message.toLowerCase().includes('no authentication token') || message.toLowerCase().includes('login first')) {
        router.replace('/login');
      } else if (message.toLowerCase().includes('session expired') || message.toLowerCase().includes('unauthorized')) {
        return;
      } else {
        if (Platform.OS === 'web') alert(message || 'Could not switch to Duty mode.');
        else Alert.alert('Could not switch to Duty mode', message || 'Please try again.');
      }
    }
  };

  return (
    <>
      <ProfilePhotoReminder />
      <OverlayPermissionPrompt />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingTop: 6,
            paddingBottom: bottomInset,
            height: 56 + bottomInset,
          },
          tabBarActiveTintColor: colors.primary,
          tabBarInactiveTintColor: colors.textSecondary,
          tabBarLabelStyle: {
            fontSize: 11,
            fontFamily: 'Inter-Medium',
            marginTop: 2,
          },
        }}
      >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabBar.home'),
          tabBarIcon: ({ size, color }) => (
            <Home size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="active"
        options={{
          title: t('tabBar.myRides'),
          tabBarIcon: ({ size, color }) => (
            <Navigation size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="drop-bid"
        options={{
          title: t('tabBar.dropMarket'),
          tabBarIcon: ({ size, color }) => (
            <Zap size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen name="drop-connect" options={{ href: null }} />
      <Tabs.Screen name="drop-radar" options={{ href: null }} />

      <Tabs.Screen name="my-bookings" options={{ href: null }} />

      <Tabs.Screen
        name="chats"
        options={{
          title: t('tabBar.chats') || 'Chat',
          tabBarIcon: ({ size, color }) => (
            <MessageCircle size={size} color={color} />
          ),
          tabBarBadge: unreadChats > 0 ? (unreadChats > 99 ? '99+' : unreadChats) : undefined,
          tabBarBadgeStyle: { backgroundColor: '#EF4444', fontSize: 10 },
        }}
      />

      <Tabs.Screen
        name="duty"
        options={{
          title: t('tabBar.duty'),
          tabBarIcon: ({ size, color }) => (
            <IdCard size={size} color={color} />
          ),
        }}
      />

      <Tabs.Screen name="create-booking" options={{ href: null }} />
      <Tabs.Screen name="executed" options={{ href: null }} />

      <Tabs.Screen name="going-empty" options={{ href: null }} />
      <Tabs.Screen name="feedbacks" options={{ href: null }} />
      <Tabs.Screen name="future-rides" options={{ href: null }} />
      <Tabs.Screen name="rides" options={{ href: null }} />
      <Tabs.Screen name="wallet" options={{ href: null }} />
      <Tabs.Screen name="profile" options={{ href: null }} />
      <Tabs.Screen name="settings" options={{ href: null }} />
      </Tabs>
    </>
  );
}
