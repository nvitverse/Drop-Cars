import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  SafeAreaView,
} from 'react-native';
import { DrawerContentScrollView } from '@react-navigation/drawer';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { User, Chrome as Home, Plus, List, Bell, Settings, LogOut, Phone, Calendar } from 'lucide-react-native';

export function DrawerContent(props: any) {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.replace('/auth');
  };

  const menuItems = [
    { icon: Home, label: 'Dashboard', route: '/(vendor)/(tabs)' },
    { icon: Plus, label: 'Create Booking', route: '/(vendor)/(tabs)/create-booking' },
    { icon: List, label: 'All Bookings', route: '/(vendor)/(tabs)/bookings' },
    { icon: Bell, label: 'Notifications', route: '/(vendor)/(tabs)/notifications' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <DrawerContentScrollView {...props}>
        {/* Profile Header */}
        <LinearGradient
          colors={['#3B82F6', '#1E40AF']}
          style={styles.profileHeader}
        >
          <View style={styles.avatarContainer}>
            <User color="#FFFFFF" size={32} strokeWidth={2} />
          </View>
          <Text style={styles.userName}>{user?.name || 'Vendor'}</Text>
          <View style={styles.userInfo}>
            <Phone color="#E5E7EB" size={14} />
            <Text style={styles.userPhone}>{user?.phone}</Text>
          </View>
          <View style={styles.memberSince}>
            <Calendar color="#E5E7EB" size={14} />
            <Text style={styles.memberText}>
              Member since {new Date(user?.createdAt || '').getFullYear()}
            </Text>
          </View>
        </LinearGradient>

        {/* Menu Items */}
        <View style={styles.menuContainer}>
          {menuItems.map((item, index) => (
            <TouchableOpacity
              key={index}
              style={styles.menuItem}
              onPress={() => router.push(item.route as any)}
            >
              <item.icon color="#374151" size={24} strokeWidth={2} />
              <Text style={styles.menuLabel}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Business Stats */}
        <View style={styles.statsContainer}>
          <Text style={styles.statsTitle}>Quick Stats</Text>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Total Bookings</Text>
            <Text style={styles.statValue}>24</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>This Month</Text>
            <Text style={styles.statValue}>8</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Commission Earned</Text>
            <Text style={styles.statValue}>₹1,250</Text>
          </View>
        </View>
      </DrawerContentScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <TouchableOpacity style={styles.settingsItem}>
          <Settings color="#6B7280" size={20} strokeWidth={2} />
          <Text style={styles.settingsLabel}>Settings</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={styles.logoutItem} onPress={handleLogout}>
          <LogOut color="#EF4444" size={20} strokeWidth={2} />
          <Text style={styles.logoutLabel}>Logout</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  profileHeader: {
    padding: 24,
    alignItems: 'center',
    marginBottom: 8,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  userName: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  userPhone: {
    fontSize: 14,
    color: '#E5E7EB',
  },
  memberSince: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberText: {
    fontSize: 12,
    color: '#E5E7EB',
  },
  menuContainer: {
    paddingVertical: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 16,
    gap: 16,
  },
  menuLabel: {
    fontSize: 16,
    color: '#374151',
    fontWeight: '500',
  },
  statsContainer: {
    margin: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 12,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
  },
  statLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  footer: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingVertical: 16,
  },
  settingsItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 16,
  },
  settingsLabel: {
    fontSize: 16,
    color: '#6B7280',
  },
  logoutItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    gap: 16,
  },
  logoutLabel: {
    fontSize: 16,
    color: '#EF4444',
    fontWeight: '500',
  },
});