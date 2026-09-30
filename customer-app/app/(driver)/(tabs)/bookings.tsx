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
import { Menu, MapPin, Navigation, Phone, Clock, CircleCheck as CheckCircle, Play, Square } from 'lucide-react-native';
import { DrawerActions } from '@react-navigation/native';
import { useNavigation } from 'expo-router';

export default function DriverBookingsScreen() {
  const { user } = useAuth();
  const { bookings, updateBookingStatus } = useBooking();
  const navigation = useNavigation();

  const openDrawer = () => {
    navigation.dispatch(DrawerActions.openDrawer());
  };

  const myBookings = bookings.filter(b => b.driverId === user?.id);

  const handleStartTrip = (bookingId: string) => {
    Alert.alert(
      'Start Trip',
      'Are you ready to start the trip?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start Trip',
          onPress: () => {
            updateBookingStatus(bookingId, 'in_progress');
            Alert.alert('Trip Started', 'Trip has been marked as started');
          }
        }
      ]
    );
  };

  const handleCompleteTrip = (bookingId: string) => {
    Alert.alert(
      'Complete Trip',
      'Mark this trip as completed?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: () => {
            updateBookingStatus(bookingId, 'completed');
            Alert.alert('Trip Completed', 'Trip has been marked as completed. Payment will be processed.');
          }
        }
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

  const getActionButton = (booking: any) => {
    switch (booking.status) {
      case 'accepted':
        return (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleStartTrip(booking.id)}
          >
            <LinearGradient
              colors={['#8B5CF6', '#7C3AED']}
              style={styles.actionGradient}
            >
              <Play color="#FFFFFF" size={16} strokeWidth={2} />
              <Text style={styles.actionButtonText}>Start Trip</Text>
            </LinearGradient>
          </TouchableOpacity>
        );
      case 'in_progress':
        return (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleCompleteTrip(booking.id)}
          >
            <LinearGradient
              colors={['#10B981', '#059669']}
              style={styles.actionGradient}
            >
              <CheckCircle color="#FFFFFF" size={16} strokeWidth={2} />
              <Text style={styles.actionButtonText}>Complete Trip</Text>
            </LinearGradient>
          </TouchableOpacity>
        );
      default:
        return null;
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
          <Text style={styles.headerTitle}>My Trips</Text>
          <View style={styles.placeholder} />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {myBookings.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyText}>No trips yet</Text>
            <Text style={styles.emptySubtext}>Accepted bookings will appear here</Text>
          </View>
        ) : (
          myBookings.map((booking) => (
            <View key={booking.id} style={styles.bookingCard}>
              <View style={styles.bookingHeader}>
                <View style={styles.customerInfo}>
                  <Text style={styles.customerName}>{booking.customerName}</Text>
                  <View style={styles.phoneContainer}>
                    <Phone color="#6B7280" size={14} />
                    <Text style={styles.customerPhone}>{booking.customerPhone}</Text>
                  </View>
                </View>
                <View style={styles.fareInfo}>
                  <Text style={styles.fareAmount}>₹{booking.driverPricing.fare}</Text>
                  <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) }]}>
                    <Text style={styles.statusText}>{booking.status.toUpperCase()}</Text>
                  </View>
                </View>
              </View>

              <View style={styles.routeContainer}>
                <View style={styles.routeItem}>
                  <MapPin color="#10B981" size={16} />
                  <Text style={styles.routeText}>{booking.pickupLocation}</Text>
                </View>
                <View style={styles.routeLine} />
                <View style={styles.routeItem}>
                  <Navigation color="#EF4444" size={16} />
                  <Text style={styles.routeText}>{booking.dropLocation}</Text>
                </View>
              </View>

              <View style={styles.tripInfo}>
                <View style={styles.tripDetail}>
                  <Clock color="#6B7280" size={16} />
                  <Text style={styles.tripDetailText}>{booking.driverPricing.estimatedTime}</Text>
                </View>
                <View style={styles.tripDetail}>
                  <Navigation color="#6B7280" size={16} />
                  <Text style={styles.tripDetailText}>{booking.driverPricing.distance} km</Text>
                </View>
              </View>

              {getActionButton(booking)}

              <View style={styles.bookingFooter}>
                <Text style={styles.bookingTime}>
                  Created: {new Date(booking.createdAt).toLocaleString()}
                </Text>
                {booking.acceptedAt && (
                  <Text style={styles.acceptedTime}>
                    Accepted: {new Date(booking.acceptedAt).toLocaleString()}
                  </Text>
                )}
                {booking.completedAt && (
                  <Text style={styles.completedTime}>
                    Completed: {new Date(booking.completedAt).toLocaleString()}
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
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginTop: 24,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
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
    marginBottom: 4,
  },
  phoneContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  customerPhone: {
    fontSize: 14,
    color: '#6B7280',
  },
  fareInfo: {
    alignItems: 'flex-end',
  },
  fareAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#10B981',
    marginBottom: 8,
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
  tripInfo: {
    flexDirection: 'row',
    gap: 24,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  tripDetail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tripDetailText: {
    fontSize: 14,
    color: '#6B7280',
  },
  actionButton: {
    borderRadius: 12,
    overflow: 'hidden',
    marginBottom: 16,
  },
  actionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  actionButtonText: {
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
    marginBottom: 2,
  },
  acceptedTime: {
    fontSize: 12,
    color: '#10B981',
    marginBottom: 2,
  },
  completedTime: {
    fontSize: 12,
    color: '#059669',
  },
});