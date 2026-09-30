import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '@/contexts/AuthContext';
import { useBooking } from '@/contexts/BookingContext';
import { Menu, Users, Phone, Car, MapPin } from 'lucide-react-native';
import { DrawerActions } from '@react-navigation/native';
import { useNavigation } from 'expo-router';

export default function BookingsScreen() {
  const { user } = useAuth();
  const { bookings, assignBookingToDriver, broadcastBooking } = useBooking();
  const navigation = useNavigation();
  const [selectedBooking, setSelectedBooking] = useState<string | null>(null);

  const openDrawer = () => {
    navigation.dispatch(DrawerActions.openDrawer());
  };

  const vendorBookings = bookings.filter(b => b.vendorId === user?.id);

  const handleAssignDriver = (bookingId: string) => {
    Alert.alert(
      'Assign Driver',
      'Choose assignment method:',
      [
        {
          text: 'Assign to Specific Driver',
          onPress: () => {
            // In a real app, this would show a driver selection modal
            assignBookingToDriver(bookingId, '2');
            Alert.alert('Success', 'Booking assigned to Mike Driver');
          }
        },
        {
          text: 'Broadcast to All Drivers',
          onPress: () => {
            broadcastBooking(bookingId);
            Alert.alert('Success', 'Booking broadcasted to all available drivers');
          }
        },
        { text: 'Cancel', style: 'cancel' }
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return '#F59E0B';
      case 'assigned': return '#3B82F6';
      case 'accepted': return '#10B981';
      case 'in_progress': return '#8B5CF6';
      case 'completed': return '#059669';
      case 'cancelled': return '#EF4444';
      default: return '#6B7280';
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
          <Text style={styles.headerTitle}>My Bookings</Text>
          <View style={styles.placeholder} />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {vendorBookings.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No bookings yet</Text>
            <Text style={styles.emptySubtext}>Create your first booking to get started</Text>
          </View>
        ) : (
          vendorBookings.map((booking) => (
            <View key={booking.id} style={styles.bookingCard}>
              <View style={styles.bookingHeader}>
                <View style={styles.customerInfo}>
                  <Text style={styles.customerName}>{booking.customerName}</Text>
                  <Text style={styles.customerPhone}>{booking.customerPhone}</Text>
                </View>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) }]}>
                  <Text style={styles.statusText}>{booking.status.toUpperCase()}</Text>
                </View>
              </View>

              <View style={styles.routeContainer}>
                <View style={styles.routeItem}>
                  <MapPin color="#10B981" size={16} />
                  <Text style={styles.routeText}>{booking.pickupLocation}</Text>
                </View>
                <View style={styles.routeLine} />
                <View style={styles.routeItem}>
                  <MapPin color="#EF4444" size={16} />
                  <Text style={styles.routeText}>{booking.dropLocation}</Text>
                </View>
              </View>

              <View style={styles.pricingInfo}>
                <View style={styles.pricingItem}>
                  <Text style={styles.pricingLabel}>Customer Pays</Text>
                  <Text style={styles.pricingAmount}>₹{booking.vendorPricing.customerAmount}</Text>
                </View>
                <View style={styles.pricingItem}>
                  <Text style={styles.pricingLabel}>Your Commission</Text>
                  <Text style={styles.commissionAmount}>₹{booking.vendorPricing.commission}</Text>
                </View>
              </View>

              {booking.assignedDriver && (
                <View style={styles.driverInfo}>
                  <View style={styles.driverHeader}>
                    <Car color="#3B82F6" size={20} />
                    <Text style={styles.driverTitle}>Assigned Driver</Text>
                  </View>
                  <Text style={styles.driverName}>{booking.assignedDriver.name}</Text>
                  <Text style={styles.driverPhone}>{booking.assignedDriver.phone}</Text>
                  <Text style={styles.carDetails}>
                    {booking.assignedDriver.carDetails.name} • {booking.assignedDriver.carDetails.number}
                  </Text>
                </View>
              )}

              {booking.status === 'pending' && (
                <TouchableOpacity
                  style={styles.assignButton}
                  onPress={() => handleAssignDriver(booking.id)}
                >
                  <LinearGradient
                    colors={['#10B981', '#059669']}
                    style={styles.assignGradient}
                  >
                    <Users color="#FFFFFF" size={20} strokeWidth={2} />
                    <Text style={styles.assignButtonText}>Assign Driver</Text>
                  </LinearGradient>
                </TouchableOpacity>
              )}

              <View style={styles.bookingFooter}>
                <Text style={styles.bookingTime}>
                  Created: {new Date(booking.createdAt).toLocaleString()}
                </Text>
                {booking.acceptedAt && (
                  <Text style={styles.acceptedTime}>
                    Accepted: {new Date(booking.acceptedAt).toLocaleString()}
                  </Text>
                )}
              </View>
            </View>
          ))
        )}
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
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#6B7280',
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 8,
  },
  bookingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  bookingHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  customerInfo: {
    flex: 1,
  },
  customerName: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  customerPhone: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 2,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  routeContainer: {
    marginBottom: 16,
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 8,
  },
  routeText: {
    fontSize: 14,
    color: '#1F2937',
    flex: 1,
  },
  routeLine: {
    width: 2,
    height: 20,
    backgroundColor: '#E5E7EB',
    marginLeft: 8,
  },
  pricingInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  pricingItem: {
    alignItems: 'center',
  },
  pricingLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginBottom: 4,
  },
  pricingAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
  },
  commissionAmount: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10B981',
  },
  driverInfo: {
    backgroundColor: '#EBF8FF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  driverHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  driverTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#3B82F6',
  },
  driverName: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 2,
  },
  driverPhone: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 4,
  },
  carDetails: {
    fontSize: 12,
    color: '#6B7280',
  },
  assignButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  assignGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  assignButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  bookingFooter: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
  },
  bookingTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  acceptedTime: {
    fontSize: 12,
    color: '#10B981',
    marginTop: 2,
  },
});