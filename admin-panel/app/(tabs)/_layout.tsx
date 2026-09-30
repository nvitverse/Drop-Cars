import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Tabs, useRouter } from 'expo-router';
import { Home, Users, Wallet, Package, Settings, UserCheck, Briefcase, MessageSquare, Megaphone, ListTodo } from 'lucide-react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { registerForPushNotificationsAsync } from '@/services/notificationService';
import { apiService } from '@/services/api';
import { enquiriesApi } from '@/services/enquiriesApi';
import { useTheme } from '@/context/ThemeContext';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const { themeColors, isDark } = useTheme();
  const router = useRouter();

  const [isOwner, setIsOwner] = useState(true);
  const [permissions, setPermissions] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) {
        router.replace('/login');
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      const role = await apiService.getCachedAdminRole();
      const perms = await apiService.getCachedAdminPermissions();
      setIsOwner(role === 'Owner');
      setPermissions(perms);
    })();
  }, []);

  const canSee = (key: string) => isOwner || permissions.includes(key);

  // Renders the tab label ourselves instead of relying on tabBarLabelStyle -
  // the library's own label wrapper was collapsing to ~3px tall on web (see
  // the long comment further down for how this was found 2026-09-29), so a
  // plain <Text> we fully control sidesteps whatever internal sizing that
  // wrapper does with a custom @font-face family.
  const renderLabel = (title: string) => ({ focused }: { focused: boolean }) => (
    <Text style={[styles.tabLabel, { color: focused ? themeColors.primary : themeColors.textMuted }]}>
      {title}
    </Text>
  );

  const [unreadChats, setUnreadChats] = useState(0);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try {
        const [support, booking] = await Promise.all([
          apiService.getSupportThreads().catch(() => []),
          apiService.getBookingChatThreads().catch(() => []),
        ]);
        const total = [...(support || []), ...(booking || [])].reduce((sum: number, t: any) => sum + (t.unread || 0), 0);
        if (!cancelled) setUnreadChats(total);
      } catch {}
    };
    refresh();
    const interval = setInterval(refresh, 20000);
    return () => { cancelled = true; clearInterval(interval); };
  }, []);

  useEffect(() => {
    (async () => {
      const token = await registerForPushNotificationsAsync();
      if (token) {
        try {
          await apiService.registerPushToken(token);
        } catch (error) {
          console.error('Failed to register admin push token:', error);
        }
        try {
          await enquiriesApi.registerPushToken(token);
        } catch (error) {
          console.error('Failed to register admin push token with website:', error);
        }
      }
    })();
  }, []);

  return (
    <Tabs
      // Explicit rather than relying on the library default - hardware/
      // gesture back from a screen pushed on top of the tab navigator (e.g.
      // Tasks -> Enquiries -> back) must return to whichever tab was
      // actually active (Tasks), not silently fall back to the first tab
      // (Home) (reported 2026-09-30).
      backBehavior="history"
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: themeColors.primary,
        tabBarInactiveTintColor: themeColors.textMuted,
        tabBarStyle: {
          backgroundColor: themeColors.surface,
          borderTopWidth: StyleSheet.hairlineWidth,
          borderTopColor: themeColors.border,
          paddingTop: 4,
          paddingBottom: insets.bottom > 0 ? insets.bottom : 6,
          height: 58 + insets.bottom,
          // Lifted rather than flush-flat against the content above it.
          elevation: 12,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: isDark ? 0.35 : 0.08,
          shadowRadius: 8,
        },
        tabBarItemStyle: {
          paddingVertical: 2,
          paddingHorizontal: 1,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          // Explicit lineHeight - without it, react-native-web collapses this
          // Text's own box to ~3px tall on web (the custom "Inter-Bold" font
          // has no metrics for the browser to fall back a line height from),
          // so every tab's label was present in the DOM (readable as text)
          // but visually invisible - found 2026-09-29 on the web preview:
          // getBoundingClientRect reported height:3 despite a roomy 47px
          // flex parent. Native builds were very likely fine either way,
          // but this makes the box height explicit for both.
          lineHeight: 14,
          fontFamily: 'Inter-Bold',
          fontWeight: '700',
          marginTop: 2,
          marginBottom: 0,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarLabel: renderLabel('Dashboard'),
          tabBarIcon: ({ size, color, focused }) => (
            <View style={styles.iconWrapper}>
              {focused && <View style={[styles.activeIndicator, { backgroundColor: themeColors.primary }]} />}
              <Home size={22} color={color} strokeWidth={focused ? 2.4 : 1.8} />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="leads"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="orders"
        options={{
          title: 'Bookings',
          tabBarLabel: renderLabel('Bookings'),
          tabBarIcon: ({ size, color, focused }) => (
            <View style={styles.iconWrapper}>
              {focused && <View style={[styles.activeIndicator, { backgroundColor: themeColors.primary }]} />}
              <Package size={22} color={color} strokeWidth={focused ? 2.4 : 1.8} />
            </View>
          ),
          href: canSee('bookings') ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: 'Tasks',
          tabBarLabel: renderLabel('Tasks'),
          tabBarIcon: ({ size, color, focused }) => (
            <View style={styles.iconWrapper}>
              {focused && <View style={[styles.activeIndicator, { backgroundColor: themeColors.primary }]} />}
              <ListTodo size={22} color={color} strokeWidth={focused ? 2.4 : 1.8} />
            </View>
          ),
          href: canSee('tasks') || canSee('bookings') || isOwner ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="chats"
        options={{
          title: 'Chats',
          tabBarLabel: renderLabel('Chats'),
          tabBarIcon: ({ size, color, focused }) => (
            <View style={styles.iconWrapper}>
              {focused && <View style={[styles.activeIndicator, { backgroundColor: themeColors.primary }]} />}
              <MessageSquare size={22} color={color} strokeWidth={focused ? 2.4 : 1.8} />
            </View>
          ),
          tabBarBadge: unreadChats > 0 ? (unreadChats > 99 ? '99+' : unreadChats) : undefined,
          tabBarBadgeStyle: {
            backgroundColor: themeColors.error,
            color: '#FFFFFF',
            fontSize: 10,
            fontFamily: 'Inter-ExtraBold',
            minWidth: 16,
            height: 16,
            borderRadius: 8,
            lineHeight: 14,
          },
          href: canSee('chats') || canSee('bookings') || isOwner ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="fleet-hub"
        options={{
          title: 'Fleet',
          tabBarLabel: renderLabel('Fleet'),
          tabBarIcon: ({ size, color, focused }) => (
            <View style={styles.iconWrapper}>
              {focused && <View style={[styles.activeIndicator, { backgroundColor: themeColors.primary }]} />}
              <Users size={22} color={color} strokeWidth={focused ? 2.4 : 1.8} />
            </View>
          ),
          href: canSee('fleet') ? undefined : null,
        }}
      />
      <Tabs.Screen
        name="our-fleet"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="profile-reviews"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="cars"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="transfers"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="vacant-cities"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="password"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="vendors"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="vehicle-owners"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="logs"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabLabel: {
    fontSize: 11,
    lineHeight: 14,
    fontFamily: 'Inter-Bold',
    fontWeight: '700',
    marginTop: 2,
    textAlign: 'center',
  },
  iconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 40,
    height: 30,
    borderRadius: 14,
  },
  activeIndicator: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 14,
    opacity: 0.14,
  },
});
