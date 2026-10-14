import React, { useEffect } from 'react';
import { syncNotificationSounds } from '../../services/soundChannelSync';
import { View, Platform } from 'react-native';
import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LayoutDashboard, Package, Plus, Menu as MenuIcon } from 'lucide-react-native';

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  // Uploaded notification sounds (play even when the app is closed).
  useEffect(() => {
    syncNotificationSounds().catch(() => {});
  }, []);

  // The bar's height follows the phone's own bottom inset (gesture bar / 3-button bar), so on phones where the app draws edge to edge the
  // labels are never hidden behind the system navigation buttons.
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'ios' ? 26 : 10);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarActiveTintColor: '#1D4ED8',
        tabBarInactiveTintColor: '#64748B',
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E2E8F0',
          height: 62 + bottomInset,
          paddingTop: 6,
          paddingBottom: bottomInset,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: -3 },
          shadowOpacity: 0.08,
          shadowRadius: 8,
          elevation: 10,
          overflow: 'visible',
        },
        tabBarItemStyle: {
          paddingVertical: 0,
          justifyContent: 'center',
          alignItems: 'center',
          overflow: 'visible',
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
          marginTop: 2,
          marginBottom: 0,
        },
        tabBarIconStyle: {
          marginTop: 0,
          marginBottom: 0,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'Dashboard',
          tabBarIcon: ({ color }) => (
            <LayoutDashboard size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="bookings"
        options={{
          title: 'Bookings',
          tabBarIcon: ({ color }) => (
            <Package size={22} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="create-order"
        options={{
          title: '',
          tabBarIcon: () => (
            <View style={{
              width: 52,
              height: 52,
              borderRadius: 26,
              backgroundColor: '#1D4ED8',
              justifyContent: 'center',
              alignItems: 'center',
              marginTop: -16,
              shadowColor: '#1D4ED8',
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.45,
              shadowRadius: 8,
              elevation: 10,
              borderWidth: 3,
              borderColor: '#FFFFFF',
            }}>
              <Plus size={24} color="#FFFFFF" />
            </View>
          ),
        }}
      />
      <Tabs.Screen
        name="transfer"
        options={{
          href: null, // Accessible via Dashboard header, Quick Actions & Menu
        }}
      />
      <Tabs.Screen
        name="history"
        options={{
          href: null, // Accessible via Wallet
        }}
      />
      <Tabs.Screen
        name="menu"
        options={{
          title: 'Menu',
          tabBarIcon: ({ color }) => (
            <MenuIcon size={22} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}