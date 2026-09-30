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
import { useWallet } from '@/contexts/WalletContext';
import { User, Chrome as Home, Wallet, List, Bell, Settings, LogOut, Phone, Calendar, DollarSign, CircleAlert as AlertCircle } from 'lucide-react-native';

export function DriverDrawerContent(props: any) {
  const { user, logout } = useAuth();
  const { wallet } = useWallet();
  const router = useRouter();

  const handleLogout = () => {
    logout();
    router.replace('/auth');
  };

  const menuItems = [
    { icon: Home, label: 'Dashboard', route: '/(driver)/(tabs)' },
    { icon: Wallet, label: 'Wallet', route: '/(driver)/(tabs)/wallet' },
    { icon: List, label: 'My Trips', route: '/(driver)/(tabs)/bookings' },
    { icon: Bell, label: 'Notifications', route: '/(driver)/(tabs)/notifications' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <DrawerContentScrollView {...props}>
        {/* Profile Header */}
        <LinearGradient
          colors={['#10B981', '#059669']}
          style={styles.profileHeader}
        >
          <View style={styles.avatarContainer}>
            <User color="#FFFFFF" size={32} strokeWidth={2} />
          </View>
          <Text style={styles.userName}>{user?.name || 'Driver'}</Text>
          <View style={styles.userInfo}>
            <Phone color="#D1FAE5" size={14} />
            <Text style={styles.userPhone}>{user?.phone}</Text>
          </View>
          <View style={styles.memberSince}>
            <Calendar color="#D1FAE5" size={14} />
            <Text style={styles.memberText}>
              Member since {new Date(user?.createdAt || '').getFullYear()}
            </Text>
          </View>
        </LinearGradient>

        {/* Wallet Quick View */}
        <View style={styles.walletCard}>
          <View style={styles.walletHeader}>
            <Wallet color="#10B981" size={20} strokeWidth={2} />
            <Text style={styles.walletTitle}>Wallet Balance</Text>
          </View>
          <Text style={styles.walletBalance}>₹{wallet?.balance || 0}</Text>
          {wallet && wallet.balance < wallet.minBalance && (
            <View style={styles.lowBalanceWarning}>
              <AlertCircle color="#F59E0B" size={16} />
              <Text style={styles.warningText}>Low balance - Add funds to accept bookings</Text>
            </View>
          )}
        </View>

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

        {/* Driver Stats */}
        <View style={styles.statsContainer}>
          <Text style={styles.statsTitle}>Your Stats</Text>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Trips Completed</Text>
            <Text style={styles.statValue}>42</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>This Week</Text>
            <Text style={styles.statValue}>7</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Total Earnings</Text>
            <Text style={styles.statValue}>₹3,680</Text>
          </View>
          <View style={styles.statRow}>
            <Text style={styles.statLabel}>Rating</Text>
            <Text style={styles.statValue}>4.8 ⭐</Text>
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
    color: '#D1FAE5',
  },
  memberSince: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  memberText: {
    fontSize: 12,
    color: '#D1FAE5',
  },
  walletCard: {
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
  walletHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  walletTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1F2937',
  },
  walletBalance: {
    fontSize: 24,
    fontWeight: '700',
    color: '#10B981',
    marginBottom: 8,
  },
  lowBalanceWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    padding: 8,
    borderRadius: 8,
  },
  warningText: {
    fontSize: 12,
    color: '#92400E',
    flex: 1,
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