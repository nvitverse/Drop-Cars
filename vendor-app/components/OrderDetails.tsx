import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { formatCarType } from '../utils/format';
import { ArrowLeft, User, Phone, Car, Calendar, Clock, MapPin, IndianRupee, FileText, CircleCheck as CheckCircle, Circle as XCircle, CircleAlert as AlertCircle, Navigation, Route } from 'lucide-react-native';

interface Order {
  id: string;
  order_id: number;
  customer_name: string;
  customer_number: string;
  trip_type: string;
  car_type: string;
  pickup_drop_location: { [key: string]: string };
  start_date_time: string;
  status: 'CONFIRMED' | 'DRIVER_ASSIGNED' | 'TRIP_STARTED' | 'TRIP_COMPLETED' | 'CANCELLED';
  driver_name?: string;
  driver_number?: string;
  vehicle_number?: string;
  fare: {
    total_km: number;
    total_amount: number;
    base_km_amount: number;
    driver_allowance: number;
    permit_charges: number;
    hill_charges: number;
    toll_charges: number;
  };
  created_at: string;
}

interface OrderDetailsProps {
  visible: boolean;
  onClose: () => void;
  order: Order | null;
}

export default function OrderDetails({ visible, onClose, order }: OrderDetailsProps) {
  if (!order) return null;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'CONFIRMED': return '#F59E0B';
      case 'DRIVER_ASSIGNED': return '#3B82F6';
      case 'TRIP_STARTED': return '#10B981';
      case 'TRIP_COMPLETED': return '#059669';
      case 'CANCELLED': return '#DC2626';
      default: return '#6B7280';
    }
  };

  const getStatusSteps = () => {
    const allSteps = [
      { key: 'CONFIRMED', label: 'Trip Accepted', date: 'Today' },
      { key: 'DRIVER_ASSIGNED', label: 'Driver Assigned', date: 'Sep 08' },
      { key: 'TRIP_STARTED', label: 'Trip Started', date: 'Sep 08' },
      { key: 'TRIP_COMPLETED', label: 'Trip Completed', date: 'Sep 12 by 11 PM' }
    ];

    if (order.status === 'CANCELLED') {
      return [
        { key: 'CONFIRMED', label: 'Trip Accepted', date: 'Today', completed: true, active: false, cancelled: false },
        { key: 'CANCELLED', label: 'Cancelled', date: 'Today', completed: true, active: false, cancelled: true }
      ];
    }

    const statusOrder = ['CONFIRMED', 'DRIVER_ASSIGNED', 'TRIP_STARTED', 'TRIP_COMPLETED'];
    const currentIndex = statusOrder.indexOf(order.status);

    return allSteps.map((step, index) => ({
      ...step,
      completed: index <= currentIndex,
      active: index === currentIndex,
      cancelled: false
    }));
  };

  const formatDateTime = (dateString: string) => {
    const date = new Date(dateString);
    return {
      date: date.toLocaleDateString('en-IN', { 
        day: '2-digit', 
        month: 'short', 
        year: 'numeric' 
      }),
      time: date.toLocaleTimeString('en-IN', { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      })
    };
  };

  const getLocationEntries = () => {
    return Object.entries(order.pickup_drop_location)
      .sort(([a], [b]) => parseInt(a) - parseInt(b));
  };

  const getLocationLabel = (index: string, isLast: boolean, tripType: string) => {
    const position = parseInt(index);
    if (position === 0) return 'Pickup Location';
    if (tripType === 'Round Trip' && isLast) return 'Return to Pickup';
    if (isLast) return 'Final Destination';
    return `Stop ${position}`;
  };

  const locations = getLocationEntries();
  const statusSteps = getStatusSteps();

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor="#059669" />
        
        {/* Header */}
        <LinearGradient
          colors={['#059669', '#10B981']}
          style={styles.header}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity onPress={onClose} style={styles.backButton}>
              <ArrowLeft size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Booking Details</Text>
            <TouchableOpacity style={styles.helpButton}>
              <Text style={styles.helpText}>Help</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Order Status Card */}
          <View style={styles.statusCard}>
            <Text style={styles.statusTitle}>Booking {order.status === 'CANCELLED' ? 'Cancelled' : 'Confirmed'}</Text>
            <Text style={styles.statusSubtitle}>
              {order.status === 'CANCELLED' 
                ? 'Your booking has been cancelled.'
                : 'Your booking has been placed.'}
            </Text>

            {/* Status Progress */}
            <View style={styles.progressContainer}>
              {statusSteps.map((step, index) => (
                <View key={step.key} style={styles.progressStep}>
                  <View style={styles.progressIndicator}>
                    <View style={[
                      styles.progressDot,
                      step.completed && styles.progressDotCompleted,
                      step.cancelled && styles.progressDotCancelled
                    ]}>
                      {step.completed && (
                        step.cancelled ? 
                        <XCircle size={16} color="#FFFFFF" /> :
                        <CheckCircle size={16} color="#FFFFFF" />
                      )}
                    </View>
                    {index < statusSteps.length - 1 && (
                      <View style={[
                        styles.progressLine,
                        step.completed && styles.progressLineCompleted
                      ]} />
                    )}
                  </View>
                  <View style={styles.progressContent}>
                    <Text style={[
                      styles.progressLabel,
                      step.completed && styles.progressLabelCompleted
                    ]}>
                      {step.label}
                    </Text>
                    <Text style={styles.progressDate}>{step.date}</Text>
                  </View>
                </View>
              ))}
            </View>

            <TouchableOpacity style={styles.seeAllUpdatesButton}>
              <Text style={styles.seeAllUpdatesText}>See all updates</Text>
            </TouchableOpacity>
          </View>

          {/* Customer Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Customer Details</Text>
            <View style={styles.detailCard}>
              <View style={styles.detailRow}>
                <User size={20} color="#1E40AF" />
                <Text style={styles.detailText}>{order.customer_name}</Text>
              </View>
              <View style={styles.detailRow}>
                <Phone size={20} color="#1E40AF" />
                <Text style={styles.detailText}>{order.customer_number}</Text>
              </View>
            </View>
          </View>

          {/* Trip Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Trip Details</Text>
            <View style={styles.detailCard}>
              <View style={styles.detailRow}>
                <Car size={20} color="#1E40AF" />
                <Text style={styles.detailText}>{order.trip_type} • {formatCarType(order.car_type)}</Text>
              </View>
              <View style={styles.detailRow}>
                <Calendar size={20} color="#1E40AF" />
                <Text style={styles.detailText}>
                  {formatDateTime(order.start_date_time).date} at {formatDateTime(order.start_date_time).time}
                </Text>
              </View>
            </View>
          </View>

          {/* Driver Details (if assigned) */}
          {order.driver_name && (
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Driver Details</Text>
              <View style={styles.detailCard}>
                <View style={styles.detailRow}>
                  <User size={20} color="#1E40AF" />
                  <Text style={styles.detailText}>{order.driver_name}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Phone size={20} color="#1E40AF" />
                  <Text style={styles.detailText}>{order.driver_number}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Car size={20} color="#1E40AF" />
                  <Text style={styles.detailText}>{order.vehicle_number}</Text>
                </View>
              </View>
            </View>
          )}

          {/* Route Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Route Details</Text>
            <View style={styles.routeCard}>
              {locations.map(([index, location], position) => (
                <View key={index} style={[styles.routeItem, position === locations.length - 1 && styles.lastRouteItem]}>
                  <View style={styles.routeIndicator}>
                    <View style={[
                      styles.routeDot,
                      position === 0 ? styles.routeDotStart : 
                      position === locations.length - 1 ? styles.routeDotEnd : styles.routeDotMiddle
                    ]} />
                    {position < locations.length - 1 && <View style={styles.routeLine} />}
                  </View>
                  <View style={styles.routeContent}>
                    <Text style={styles.routeLabel}>
                      {getLocationLabel(index, position === locations.length - 1, order.trip_type)}
                    </Text>
                    <Text style={styles.routeLocation}>{location}</Text>
                  </View>
                </View>
              ))}
            </View>
          </View>

          {/* Price Details */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Price details</Text>
            <View style={styles.priceCard}>
              <View style={styles.priceRow}>
                <Text style={styles.priceLabel}>Base fare ({order.fare.total_km} km)</Text>
                <Text style={styles.priceValue}>₹{order.fare.base_km_amount}</Text>
              </View>
              
              {order.fare.driver_allowance > 0 && (
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Driver allowance</Text>
                  <Text style={styles.priceValue}>₹{order.fare.driver_allowance}</Text>
                </View>
              )}
              
              {order.fare.permit_charges > 0 && (
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Permit charges</Text>
                  <Text style={styles.priceValue}>₹{order.fare.permit_charges}</Text>
                </View>
              )}
              
              {order.fare.hill_charges > 0 && (
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Hill charges</Text>
                  <Text style={styles.priceValue}>₹{order.fare.hill_charges}</Text>
                </View>
              )}
              
              {order.fare.toll_charges > 0 && (
                <View style={styles.priceRow}>
                  <Text style={styles.priceLabel}>Toll charges</Text>
                  <Text style={styles.priceValue}>₹{order.fare.toll_charges}</Text>
                </View>
              )}
              
              <View style={[styles.priceRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total amount</Text>
                <Text style={styles.totalValue}>₹{order.fare.total_amount}</Text>
              </View>
              
              <View style={styles.paymentRow}>
                <Text style={styles.paymentLabel}>Paid by</Text>
                <View style={styles.paymentMethod}>
                  <IndianRupee size={16} color="#5F6368" />
                  <Text style={styles.paymentText}>Cash On Delivery</Text>
                </View>
              </View>
            </View>
          </View>

          {/* Order ID */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Booking ID</Text>
            <Text style={styles.orderIdText}>OD{order.order_id}95389741{order.id}00</Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingTop: 10,
    paddingBottom: 20,
    paddingHorizontal: 20,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    flex: 1,
    textAlign: 'center',
  },
  helpButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  helpText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
  content: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    margin: 20,
    padding: 20,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: '#E3F2FD',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 4,
  },
  statusTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#202124',
    marginBottom: 8,
  },
  statusSubtitle: {
    fontSize: 16,
    color: '#5F6368',
    marginBottom: 24,
  },
  progressContainer: {
    marginBottom: 20,
  },
  progressStep: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  progressIndicator: {
    alignItems: 'center',
    marginRight: 16,
    width: 24,
  },
  progressDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#E5E7EB',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  progressDotCompleted: {
    backgroundColor: '#10B981',
  },
  progressDotCancelled: {
    backgroundColor: '#DC2626',
  },
  progressLine: {
    width: 2,
    height: 32,
    backgroundColor: '#E5E7EB',
    position: 'absolute',
    top: 24,
  },
  progressLineCompleted: {
    backgroundColor: '#10B981',
  },
  progressContent: {
    flex: 1,
    paddingTop: 2,
  },
  progressLabel: {
    fontSize: 16,
    color: '#9CA3AF',
    fontWeight: '500',
    marginBottom: 2,
  },
  progressLabelCompleted: {
    color: '#202124',
  },
  progressDate: {
    fontSize: 14,
    color: '#6B7280',
  },
  seeAllUpdatesButton: {
    alignSelf: 'center',
    paddingVertical: 8,
  },
  seeAllUpdatesText: {
    fontSize: 16,
    color: '#1E40AF',
    fontWeight: '600',
  },
  section: {
    marginHorizontal: 20,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#202124',
    marginBottom: 12,
  },
  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F3F4',
  },
  detailText: {
    fontSize: 16,
    color: '#202124',
    marginLeft: 12,
    flex: 1,
  },
  routeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
  },
  routeItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  lastRouteItem: {
    marginBottom: 0,
  },
  routeIndicator: {
    alignItems: 'center',
    marginRight: 16,
    width: 24,
  },
  routeDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginBottom: 8,
  },
  routeDotStart: {
    backgroundColor: '#10B981',
  },
  routeDotMiddle: {
    backgroundColor: '#F59E0B',
  },
  routeDotEnd: {
    backgroundColor: '#DC2626',
  },
  routeLine: {
    width: 2,
    height: 32,
    backgroundColor: '#D1D5DB',
    position: 'absolute',
    top: 12,
  },
  routeContent: {
    flex: 1,
    paddingTop: -2,
  },
  routeLabel: {
    fontSize: 14,
    color: '#5F6368',
    fontWeight: '500',
    marginBottom: 4,
  },
  routeLocation: {
    fontSize: 16,
    color: '#202124',
    fontWeight: '500',
    lineHeight: 22,
  },
  priceCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  priceLabel: {
    fontSize: 16,
    color: '#202124',
  },
  priceValue: {
    fontSize: 16,
    color: '#202124',
    fontWeight: '500',
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    paddingTop: 12,
    marginTop: 8,
  },
  totalLabel: {
    fontSize: 18,
    color: '#202124',
    fontWeight: 'bold',
  },
  totalValue: {
    fontSize: 18,
    color: '#202124',
    fontWeight: 'bold',
  },
  paymentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 16,
    marginTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F3F4',
  },
  paymentLabel: {
    fontSize: 16,
    color: '#202124',
  },
  paymentMethod: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  paymentText: {
    fontSize: 16,
    color: '#5F6368',
    marginLeft: 4,
  },
  orderIdText: {
    fontSize: 16,
    color: '#1E40AF',
    fontFamily: 'monospace',
  },
});