import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  TextInput,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useBooking } from '@/contexts/BookingContext';
import { useWallet } from '@/contexts/WalletContext';
import { Menu, Wallet, TrendingUp, Clock, CircleCheck as CheckCircle, MapPin, Navigation, Car, Phone, User, CircleAlert as AlertCircle } from 'lucide-react-native';
import { DrawerActions } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import { SafeArea } from '@/components/SafeArea';

export default function DriverDashboard() {
  const { user } = useAuth();
  const { availableBookings, acceptBooking, bookings } = useBooking();
  const { wallet, canAcceptBooking, deductFunds } = useWallet();
  const router = useRouter();
  const navigation = useNavigation();

  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [selectedBookingId, setSelectedBookingId] = useState<string | null>(null);
  const [carName, setCarName] = useState('Swift Dzire');
  const [carType, setCarType] = useState('Sedan');
  const [carNumber, setCarNumber] = useState('DL 12 AB 1234');

  const openDrawer = () => {
    navigation.dispatch(DrawerActions.openDrawer());
  };

  const myBookings = bookings.filter(b => b.driverId === user?.id);
  const completedTrips = myBookings.filter(b => b.status === 'completed').length;
  const activeTrips = myBookings.filter(b => ['accepted', 'in_progress'].includes(b.status)).length;
  const totalEarnings = myBookings
    .filter(b => b.status === 'completed')
    .reduce((sum, b) => sum + b.driverPricing.fare, 0);

  const handleAcceptBooking = (bookingId: string) => {
    if (!canAcceptBooking()) {
      Alert.alert(
        'Insufficient Balance',
        'Your wallet balance is below the minimum required amount. Please add funds to continue.',
        [
          { text: 'Add Funds', onPress: () => router.push('/(driver)/(tabs)/wallet') },
          { text: 'Cancel', style: 'cancel' }
        ]
      );
      return;
    }

    setSelectedBookingId(bookingId);
    setShowAcceptModal(true);
  };

  const confirmAcceptBooking = async () => {
    if (!selectedBookingId || !carName || !carType || !carNumber) {
      Alert.alert('Error', 'Please fill all car details');
      return;
    }

    const booking = availableBookings.find(b => b.id === selectedBookingId);
    if (!booking) return;

    // Deduct acceptance fee (10% of fare)
    const acceptanceFee = Math.round(booking.driverPricing.fare * 0.1);
    const success = await deductFunds(acceptanceFee, 'Booking acceptance fee');

    if (success) {
      const driverInfo = {
        name: user?.name || 'Driver',
        phone: user?.phone || '',
        carDetails: {
          name: carName,
          type: carType,
          number: carNumber
        }
      };

      acceptBooking(selectedBookingId, driverInfo);
      setShowAcceptModal(false);
      setSelectedBookingId(null);
      
      Alert.alert('Success', 'Booking accepted! Customer has been notified.');
    } else {
      Alert.alert('Error', 'Failed to process acceptance fee');
    }
  };

  return (
    <SafeArea style={styles.container}>
      <LinearGradient
        colors={['#10B981', '#059669']}
        style={styles.header}
      >
        <View style={styles.headerTop}>
          <TouchableOpacity onPress={openDrawer} style={styles.menuButton}>
            <Menu color="#FFFFFF" size={24} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Driver Dashboard</Text>
          <TouchableOpacity onPress={() => router.push('/(driver)/(tabs)/wallet')}>
            <Wallet color="#FFFFFF" size={24} strokeWidth={2} />
          </TouchableOpacity>
        </View>
        
        <View style={styles.welcomeSection}>
          <Text style={styles.welcomeText}>Welcome back,</Text>
          <Text style={styles.userName}>{user?.name || 'Driver'}</Text>
          <View style={styles.walletInfo}>
            <Text style={styles.walletLabel}>Wallet Balance</Text>
            <Text style={styles.walletBalance}>₹{wallet?.balance || 0}</Text>
          </View>
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Quick Stats */}
        <View style={styles.statsContainer}>
          <View style={styles.statCard}>
            <Clock color="#10B981" size={24} strokeWidth={2} />
            <Text style={styles.statNumber}>{activeTrips}</Text>
            <Text style={styles.statLabel}>Active</Text>
          </View>
          
          <View style={styles.statCard}>
            <CheckCircle color="#3B82F6" size={24} strokeWidth={2} />
            <Text style={styles.statNumber}>{completedTrips}</Text>
            <Text style={styles.statLabel}>Completed</Text>
          </View>
          
          <View style={styles.statCard}>
            <TrendingUp color="#F97316" size={24} strokeWidth={2} />
            <Text style={styles.statNumber}>₹{totalEarnings}</Text>
            <Text style={styles.statLabel}>Earned</Text>
          </View>
        </View>

        {/* Wallet Status */}
        {wallet && wallet.balance < wallet.minBalance && (
          <View style={styles.warningCard}>
            <AlertCircle color="#F59E0B" size={24} strokeWidth={2} />
            <View style={styles.warningContent}>
              <Text style={styles.warningTitle}>Low Wallet Balance</Text>
              <Text style={styles.warningText}>
                Add funds to accept new bookings (Min: ₹{wallet.minBalance})
              </Text>
            </View>
            <TouchableOpacity
              style={styles.addFundsButton}
              onPress={() => router.push('/(driver)/(tabs)/wallet')}
            >
              <Text style={styles.addFundsText}>Add Funds</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Available Bookings */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Available Bookings</Text>
          
          {availableBookings.length === 0 ? (
            <View style={styles.emptyState}>
              <Car color="#9CA3AF" size={48} strokeWidth={1} />
              <Text style={styles.emptyText}>No bookings available</Text>
              <Text style={styles.emptySubtext}>New bookings will appear here</Text>
            </View>
          ) : (
            availableBookings.map((booking) => (
              <View key={booking.id} style={styles.bookingCard}>
                <View style={styles.bookingHeader}>
                  <View style={styles.customerInfo}>
                    <Text style={styles.customerName}>{booking.customerName}</Text>
                    <Text style={styles.customerPhone}>{booking.customerPhone}</Text>
                  </View>
                  <Text style={styles.fareAmount}>₹{booking.driverPricing.fare}</Text>
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

                <View style={styles.tripDetails}>
                  <Text style={styles.tripDetail}>Distance: {booking.driverPricing.distance} km</Text>
                  <Text style={styles.tripDetail}>Time: {booking.driverPricing.estimatedTime}</Text>
                </View>

                <TouchableOpacity
                  style={[
                    styles.acceptButton,
                    !canAcceptBooking() && styles.disabledButton
                  ]}
                  onPress={() => handleAcceptBooking(booking.id)}
                  disabled={!canAcceptBooking()}
                >
                  <LinearGradient
                    colors={canAcceptBooking() ? ['#10B981', '#059669'] : ['#9CA3AF', '#6B7280']}
                    style={styles.acceptGradient}
                  >
                    <CheckCircle color="#FFFFFF" size={20} strokeWidth={2} />
                    <Text style={styles.acceptButtonText}>
                      {canAcceptBooking() ? 'Accept Booking' : 'Insufficient Balance'}
                    </Text>
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            ))
          )}
        </View>

        {/* Recent Trips */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Recent Trips</Text>
            <TouchableOpacity onPress={() => router.push('/(driver)/(tabs)/bookings')}>
              <Text style={styles.seeAll}>See All</Text>
            </TouchableOpacity>
          </View>
          
          {myBookings.slice(0, 3).map((booking) => (
            <View key={booking.id} style={styles.tripCard}>
              <View style={styles.tripHeader}>
                <Text style={styles.tripCustomer}>{booking.customerName}</Text>
                <View style={[styles.statusBadge, { backgroundColor: getStatusColor(booking.status) }]}>
                  <Text style={styles.statusText}>{booking.status.toUpperCase()}</Text>
                </View>
              </View>
              
              <Text style={styles.tripRoute}>
                {booking.pickupLocation} → {booking.dropLocation}
              </Text>
              
              <View style={styles.tripFooter}>
                <Text style={styles.tripEarning}>₹{booking.driverPricing.fare}</Text>
                <Text style={styles.tripTime}>
                  {new Date(booking.createdAt).toLocaleDateString()}
                </Text>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Accept Booking Modal */}
      <Modal
        visible={showAcceptModal}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setShowAcceptModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>Enter Car Details</Text>
            
            <View style={styles.inputContainer}>
              <Car color="#6B7280" size={20} />
              <TextInput
                style={styles.input}
                placeholder="Car Name (e.g., Swift Dzire)"
                value={carName}
                onChangeText={setCarName}
              />
            </View>

            <View style={styles.inputContainer}>
              <Car color="#6B7280" size={20} />
              <TextInput
                style={styles.input}
                placeholder="Car Type (e.g., Sedan)"
                value={carType}
                onChangeText={setCarType}
              />
            </View>

            <View style={styles.inputContainer}>
              <Car color="#6B7280" size={20} />
              <TextInput
                style={styles.input}
                placeholder="Car Number (e.g., DL 12 AB 1234)"
                value={carNumber}
                onChangeText={setCarNumber}
              />
            </View>

            <View style={styles.modalButtons}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowAcceptModal(false)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={confirmAcceptBooking}
              >
                <Text style={styles.confirmButtonText}>Accept Booking</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeArea>
  );
}

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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F9FAFB',
  },
  header: {
    paddingTop: 16,
    paddingBottom: 32,
    paddingHorizontal: 20,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  menuButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  welcomeSection: {
    marginTop: 24,
  },
  welcomeText: {
    fontSize: 16,
    color: '#D1FAE5',
  },
  userName: {
    fontSize: 24,
    fontWeight: '700',
    color: '#FFFFFF',
    marginTop: 4,
  },
  walletInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
    padding: 16,
  },
  walletLabel: {
    fontSize: 14,
    color: '#D1FAE5',
  },
  walletBalance: {
    fontSize: 20,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: -24,
    marginBottom: 24,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  statNumber: {
    fontSize: 24,
    fontWeight: '700',
    color: '#1F2937',
    marginTop: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 4,
  },
  warningCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
    gap: 12,
  },
  warningContent: {
    flex: 1,
  },
  warningTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#92400E',
  },
  warningText: {
    fontSize: 14,
    color: '#92400E',
    marginTop: 2,
  },
  addFundsButton: {
    backgroundColor: '#F59E0B',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  addFundsText: {
    color: '#FFFFFF',
    fontWeight: '600',
    fontSize: 12,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  seeAll: {
    fontSize: 14,
    color: '#10B981',
    fontWeight: '600',
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: '#9CA3AF',
    marginTop: 4,
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
  fareAmount: {
    fontSize: 24,
    fontWeight: '700',
    color: '#10B981',
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
  tripDetails: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 12,
    marginBottom: 16,
  },
  tripDetail: {
    fontSize: 14,
    color: '#6B7280',
  },
  acceptButton: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  disabledButton: {
    opacity: 0.6,
  },
  acceptGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  tripCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tripHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tripCustomer: {
    fontSize: 16,
    fontWeight: '600',
    color: '#1F2937',
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  tripRoute: {
    fontSize: 14,
    color: '#6B7280',
    marginBottom: 12,
  },
  tripFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  tripEarning: {
    fontSize: 18,
    fontWeight: '700',
    color: '#10B981',
  },
  tripTime: {
    fontSize: 12,
    color: '#9CA3AF',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    width: '100%',
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: '#1F2937',
    textAlign: 'center',
    marginBottom: 24,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 16,
    gap: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: '#F3F4F6',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6B7280',
  },
  confirmButton: {
    flex: 1,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});