import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Menu, Bell, Car, DollarSign, TriangleAlert as AlertTriangle, CircleCheck as CheckCircle } from 'lucide-react-native';
import { DrawerActions } from '@react-navigation/native';
import { useNavigation } from 'expo-router';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'booking' | 'payment' | 'system' | 'warning';
  timestamp: string;
  read: boolean;
}

const driverNotifications: Notification[] = [
  {
    id: '1',
    title: 'New Booking Available',
    message: 'A new booking is available from Connaught Place to India Gate - ₹150',
    type: 'booking',
    timestamp: '2024-01-15T11:30:00Z',
    read: false,
  },
  {
    id: '2',
    title: 'Payment Received',
    message: 'Trip payment of ₹120 has been credited to your wallet',
    type: 'payment',
    timestamp: '2024-01-15T10:45:00Z',
    read: false,
  },
  {
    id: '3',
    title: 'Wallet Low Balance',
    message: 'Your wallet balance is below minimum threshold. Add funds to continue accepting bookings.',
    type: 'warning',
    timestamp: '2024-01-15T09:20:00Z',
    read: true,
  },
  {
    id: '4',
    title: 'Trip Completed',
    message: 'Your trip for Raj Patel has been marked as completed',
    type: 'booking',
    timestamp: '2024-01-15T08:15:00Z',
    read: true,
  },
  {
    id: '5',
    title: 'Booking Cancelled',
    message: 'Booking for Sarah Johnson has been cancelled by vendor',
    type: 'system',
    timestamp: '2024-01-15T07:30:00Z',
    read: true,
  },
];

export default function DriverNotificationsScreen() {
  const navigation = useNavigation();

  const openDrawer = () => {
    navigation.dispatch(DrawerActions.openDrawer());
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'booking': return <Car color="#3B82F6" size={20} />;
      case 'payment': return <DollarSign color="#10B981" size={20} />;
      case 'warning': return <AlertTriangle color="#F59E0B" size={20} />;
      case 'system': return <Bell color="#6B7280" size={20} />;
      default: return <Bell color="#6B7280" size={20} />;
    }
  };

  const getNotificationBorderColor = (type: string) => {
    switch (type) {
      case 'booking': return '#3B82F6';
      case 'payment': return '#10B981';
      case 'warning': return '#F59E0B';
      case 'system': return '#6B7280';
      default: return '#E5E7EB';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#10B981', '#059669']}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={openDrawer} style={styles.menuButton}>
            <Menu color="#FFFFFF" size={24} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Notifications</Text>
          <View style={styles.placeholder} />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {driverNotifications.map((notification) => (
          <TouchableOpacity 
            key={notification.id} 
            style={[
              styles.notificationCard,
              { borderLeftColor: getNotificationBorderColor(notification.type) }
            ]}
          >
            <View style={styles.notificationContent}>
              <View style={styles.notificationIcon}>
                {getNotificationIcon(notification.type)}
              </View>
              
              <View style={styles.notificationText}>
                <Text style={styles.notificationTitle}>{notification.title}</Text>
                <Text style={styles.notificationMessage}>{notification.message}</Text>
                <Text style={styles.notificationTime}>
                  {new Date(notification.timestamp).toLocaleString()}
                </Text>
              </View>
              
              {!notification.read && <View style={styles.unreadIndicator} />}
            </View>
          </TouchableOpacity>
        ))}

        {/* Notification Settings */}
        <View style={styles.settingsCard}>
          <Text style={styles.settingsTitle}>Notification Preferences</Text>
          
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Car color="#3B82F6" size={20} />
              <Text style={styles.settingLabel}>New Booking Alerts</Text>
            </View>
            <View style={styles.toggleEnabled}>
              <CheckCircle color="#10B981" size={20} />
            </View>
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <DollarSign color="#10B981" size={20} />
              <Text style={styles.settingLabel}>Payment Notifications</Text>
            </View>
            <View style={styles.toggleEnabled}>
              <CheckCircle color="#10B981" size={20} />
            </View>
          </View>

          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <AlertTriangle color="#F59E0B" size={20} />
              <Text style={styles.settingLabel}>Wallet Alerts</Text>
            </View>
            <View style={styles.toggleEnabled}>
              <CheckCircle color="#10B981" size={20} />
            </View>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingTop: 16,
    paddingBottom: 24,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
  },
  menuButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  notificationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    marginBottom: 12,
    borderLeftWidth: 4,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  notificationContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 16,
    position: 'relative',
  },
  notificationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#F3F4F6',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  notificationText: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
    marginBottom: 4,
  },
  notificationMessage: {
    fontSize: 14,
    color: '#6B7280',
    lineHeight: 20,
    marginBottom: 8,
  },
  notificationTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  unreadIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
    position: 'absolute',
    top: 20,
    right: 16,
  },
  settingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginTop: 16,
    marginBottom: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  settingsTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F3F4F6',
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    color: '#374151',
  },
  toggleEnabled: {
    padding: 4,
  },
});