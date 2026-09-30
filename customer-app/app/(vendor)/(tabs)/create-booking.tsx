import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useAuth } from '@/contexts/AuthContext';
import { useBooking } from '@/contexts/BookingContext';
import { Menu, User, Phone, MapPin, DollarSign, Clock, Navigation } from 'lucide-react-native';
import { DrawerActions } from '@react-navigation/native';
import { useNavigation } from 'expo-router';
import { SafeArea } from '@/components/SafeArea';

export default function CreateBooking() {
  const { user } = useAuth();
  const { createBooking } = useBooking();
  const router = useRouter();
  const navigation = useNavigation();

  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [pickupLocation, setPickupLocation] = useState('');
  const [dropLocation, setDropLocation] = useState('');
  
  // Driver pricing
  const [driverFare, setDriverFare] = useState('');
  const [distance, setDistance] = useState('');
  const [estimatedTime, setEstimatedTime] = useState('');
  
  // Vendor pricing
  const [customerAmount, setCustomerAmount] = useState('');
  const [commission, setCommission] = useState('');

  const openDrawer = () => {
    navigation.dispatch(DrawerActions.openDrawer());
  };

  const handleSubmit = () => {
    if (!customerName || !customerPhone || !pickupLocation || !dropLocation || 
        !driverFare || !distance || !estimatedTime || !customerAmount || !commission) {
      Alert.alert('Error', 'Please fill all fields');
      return;
    }

    const newBooking = {
      vendorId: user?.id || '1',
      customerName,
      customerPhone,
      pickupLocation,
      dropLocation,
      driverPricing: {
        fare: parseFloat(driverFare),
        distance: parseFloat(distance),
        estimatedTime
      },
      vendorPricing: {
        customerAmount: parseFloat(customerAmount),
        commission: parseFloat(commission)
      }
    };

    createBooking(newBooking);
    
    Alert.alert(
      'Success',
      'Booking created successfully!',
      [
        { text: 'Create Another', style: 'default' },
        { 
          text: 'View Bookings', 
          onPress: () => router.push('/(vendor)/(tabs)/bookings'),
          style: 'default'
        }
      ]
    );

    // Reset form
    setCustomerName('');
    setCustomerPhone('');
    setPickupLocation('');
    setDropLocation('');
    setDriverFare('');
    setDistance('');
    setEstimatedTime('');
    setCustomerAmount('');
    setCommission('');
  };

  return (
    <SafeArea style={styles.container}>
      <LinearGradient
        colors={['#3B82F6', '#1E40AF']}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity onPress={openDrawer} style={styles.menuButton}>
            <Menu color="#FFFFFF" size={24} strokeWidth={2} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Create Booking</Text>
          <View style={styles.placeholder} />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Customer Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Customer Details</Text>
          
          <View style={styles.inputContainer}>
            <User color="#6B7280" size={20} />
            <TextInput
              style={styles.input}
              placeholder="Customer Name"
              placeholderTextColor="#9CA3AF"
              value={customerName}
              onChangeText={setCustomerName}
            />
          </View>

          <View style={styles.inputContainer}>
            <Phone color="#6B7280" size={20} />
            <TextInput
              style={styles.input}
              placeholder="Customer Phone"
              placeholderTextColor="#9CA3AF"
              value={customerPhone}
              onChangeText={setCustomerPhone}
              keyboardType="phone-pad"
            />
          </View>
        </View>

        {/* Location Details */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Trip Details</Text>
          
          <View style={styles.inputContainer}>
            <MapPin color="#10B981" size={20} />
            <TextInput
              style={styles.input}
              placeholder="Pickup Location"
              placeholderTextColor="#9CA3AF"
              value={pickupLocation}
              onChangeText={setPickupLocation}
            />
          </View>

          <View style={styles.inputContainer}>
            <Navigation color="#EF4444" size={20} />
            <TextInput
              style={styles.input}
              placeholder="Drop Location"
              placeholderTextColor="#9CA3AF"
              value={dropLocation}
              onChangeText={setDropLocation}
            />
          </View>
        </View>

        {/* Dual Pricing Forms */}
        <View style={styles.pricingContainer}>
          {/* Driver Pricing */}
          <View style={styles.pricingCard}>
            <Text style={styles.pricingTitle}>Driver Pricing</Text>
            
            <View style={styles.inputContainer}>
              <DollarSign color="#6B7280" size={20} />
              <TextInput
                style={styles.input}
                placeholder="Driver Fare (₹)"
                placeholderTextColor="#9CA3AF"
                value={driverFare}
                onChangeText={setDriverFare}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.inputContainer}>
              <Navigation color="#6B7280" size={20} />
              <TextInput
                style={styles.input}
                placeholder="Distance (km)"
                placeholderTextColor="#9CA3AF"
                value={distance}
                onChangeText={setDistance}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.inputContainer}>
              <Clock color="#6B7280" size={20} />
              <TextInput
                style={styles.input}
                placeholder="Estimated Time"
                placeholderTextColor="#9CA3AF"
                value={estimatedTime}
                onChangeText={setEstimatedTime}
              />
            </View>
          </View>

          {/* Vendor Pricing */}
          <View style={styles.pricingCard}>
            <Text style={styles.pricingTitle}>Vendor Pricing</Text>
            
            <View style={styles.inputContainer}>
              <DollarSign color="#6B7280" size={20} />
              <TextInput
                style={styles.input}
                placeholder="Customer Amount (₹)"
                placeholderTextColor="#9CA3AF"
                value={customerAmount}
                onChangeText={setCustomerAmount}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.inputContainer}>
              <DollarSign color="#6B7280" size={20} />
              <TextInput
                style={styles.input}
                placeholder="Your Commission (₹)"
                placeholderTextColor="#9CA3AF"
                value={commission}
                onChangeText={setCommission}
                keyboardType="numeric"
              />
            </View>

            <View style={styles.calculatedProfit}>
              <Text style={styles.profitLabel}>Driver Gets:</Text>
              <Text style={styles.profitAmount}>
                ₹{customerAmount && commission ? 
                  (parseFloat(customerAmount) - parseFloat(commission || '0')).toString() : '0'}
              </Text>
            </View>
          </View>
        </View>

        {/* Submit Button */}
        <TouchableOpacity style={styles.submitButton} onPress={handleSubmit}>
          <LinearGradient
            colors={['#10B981', '#059669']}
            style={styles.submitGradient}
          >
            <Text style={styles.submitText}>Create Booking</Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </SafeArea>
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
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 12,
    gap: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#1F2937',
  },
  pricingContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  pricingCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  pricingTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#1F2937',
    marginBottom: 16,
    textAlign: 'center',
  },
  calculatedProfit: {
    backgroundColor: '#F3F4F6',
    borderRadius: 8,
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  profitLabel: {
    fontSize: 14,
    color: '#6B7280',
  },
  profitAmount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#10B981',
  },
  submitButton: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 32,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  submitGradient: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  submitText: {
    fontSize: 18,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});