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
import { Menu, Bell, Check, Clock, Car } from 'lucide-react-native';
import { DrawerActions } from '@react-navigation/native';
import { useNavigation } from 'expo-router';

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'booking' | 'payment' | 'driver' | 'system';
  timestamp: string;
  read: boolean;
}

const dummyNotifications: Notification[] = [
  {
    id: '1',
    title: 'Booking Accepted',
    message: 'Driver Mike accepted your booking for Sarah Johnson',
    type: 'booking',
    timestamp: '2024-01-15T10:30:00Z',
    read: false,
  },
  {
    id: '2',
    title: 'Payment Received',
    message: 'Commission of ₹50 credited to your account',
    type: 'payment',
    timestamp: '2024-01-15T09:45:00Z',
    read: true,
  },
  {
    id: '3',
    title: 'New Driver Registration',
    message: 'A new driver has registered and is available for bookings',
    type: 'driver',
    timestamp: '2024-01-15T08:20:00Z',
    read: true,
  },
  {
    id: '4',
    title: 'Trip Completed',
    message: 'Trip for Raj Patel has been completed successfully',
    type: 'booking',
    timestamp: '2024-01-15T07:15:00Z',
    read: true,
  },
];

export default function NotificationsScreen() {
  const navigation = useNavigation();

  const openDrawer = () => {
    navigation.dispatch(DrawerActions.openDrawer());
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'booking': return <Car color="#3B82F6" size={20} />;
      case 'payment': return <Check color="#10B981" size={20} />;
      case 'driver': return <Car color="#F97316" size={20} />;
      case 'system': return <Bell color="#6B7280" size={20} />;
      default: return <Bell color="#6B7280" size={20} />;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <LinearGradient
        colors={['#3B82F6', '#1E40AF']}
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
        {dummyNotifications.map((notification) => (
          <TouchableOpacity key={notification.id} style={styles.notificationCard}>
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
    backgroundColor: '#3B82F6',
    position: 'absolute',
    top: 20,
    right: 16,
  },
});