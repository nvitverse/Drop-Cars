import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Modal,
  Animated,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { CircleCheck as CheckCircle, Copy, ArrowLeft, Timer, UserCheck } from 'lucide-react-native';
import { router } from 'expo-router';
import ManualAssignModal from './ManualAssignModal';

interface OrderSuccessProps {
  visible: boolean;
  onClose: () => void;
  orderData: any;
}

const OrderSuccess: React.FC<OrderSuccessProps> = ({ visible, onClose, orderData }) => {
  const [showManualAssignModal, setShowManualAssignModal] = React.useState(false);
  const checkmarkScale = useRef(new Animated.Value(0)).current;
  const checkmarkOpacity = useRef(new Animated.Value(0)).current;
  const contentOpacity = useRef(new Animated.Value(0)).current;
  const contentTranslateY = useRef(new Animated.Value(20)).current;

  useEffect(() => {
    if (visible && orderData) {
      // Reset animations
      checkmarkScale.setValue(0);
      checkmarkOpacity.setValue(0);
      contentOpacity.setValue(0);
      contentTranslateY.setValue(20);

      // Start animation sequence
      Animated.sequence([
        // Animate checkmark first
        Animated.parallel([
          Animated.spring(checkmarkScale, {
            toValue: 1,
            useNativeDriver: true,
            tension: 100,
            friction: 8,
          }),
          Animated.timing(checkmarkOpacity, {
            toValue: 1,
            duration: 500,
            useNativeDriver: true,
          }),
        ]),
        // Then fade in content
        Animated.parallel([
          Animated.timing(contentOpacity, {
            toValue: 1,
            duration: 400,
            useNativeDriver: true,
          }),
          Animated.spring(contentTranslateY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 80,
            friction: 8,
          }),
        ]),
      ]).start();
    }
  }, [visible, orderData]);

  if (!visible || !orderData) {
    return null;
  }

  const isHourlyRental = orderData.trip_type === 'Hourly Rental';

  const getOrderStatus = () => {
    return orderData.trip_status || orderData.order_status || 'PENDING';
  };

  const getPickupCity = () => {
    return orderData.pick_near_city || orderData.picup_near_city || 'N/A';
  };

  const hasFareDetails = () => {
    return orderData.fare && typeof orderData.fare === 'object';
  };

  const formatAmount = (amount: number | string) => {
    return `₹${amount}`;
  };

  const handleOrderPress = () => {
    onClose()
    router.push(`/(tabs)`);
  };

  const getDisplayAmount = () => {
    if (isHourlyRental) {
      console.log('Order Data for Hourly Rental:', orderData);
      return orderData.estimated_price ? formatAmount(orderData.vendor_price) : '₹0.00';
    }
    return hasFareDetails() && orderData.fare.total_amount 
      ? formatAmount(orderData.fare.total_amount)
      : orderData.vendor_price;
  };

  return (
    <Modal
      visible={visible}
      animationType="none"
      presentationStyle="fullScreen"
    >
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor="#FFFFFF" />
        
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={onClose} style={styles.backButton}>
            <ArrowLeft size={24} color="#000000" />
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.scrollContainer} showsVerticalScrollIndicator={false}>
          {/* Success Section */}
          <View style={styles.successSection}>
            <Animated.View 
              style={[
                styles.checkmarkContainer,
                {
                  transform: [{ scale: checkmarkScale }],
                  opacity: checkmarkOpacity,
                }
              ]}
            >
              <View style={styles.checkmarkCircle}>
                <CheckCircle size={32} color="#FFFFFF" strokeWidth={2.5} />
              </View>
            </Animated.View>

            <Text style={styles.successTitle}>Booking Successful</Text>
            {isHourlyRental && (
              <Text style={styles.successSubtitle}>Your hourly rental has been booked</Text>
            )}
          </View>

          {/* Content */}
          <Animated.View 
            style={[
              styles.contentContainer,
              {
                opacity: contentOpacity,
                transform: [{ translateY: contentTranslateY }],
              }
            ]}
          >
            {/* Amount Card */}
            <View style={styles.amountCard}>
              <View style={styles.amountHeader}>
                <Text style={styles.amountValue}>
                  {getDisplayAmount()}
                </Text>
                <TouchableOpacity style={styles.expandButton}>
                  <Text style={styles.expandIcon}>^</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.customerName}>{orderData.customerName}</Text>
              <Text style={styles.orderDate}>
                {new Date().toLocaleDateString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                })} • {new Date().toLocaleTimeString('en-US', {
                  hour: '2-digit',
                  minute: '2-digit',
                  hour12: true
                })}
              </Text>
            </View>

            {/* Transaction Details */}
            <View style={styles.detailsContainer}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Booking ID</Text>
                <View style={styles.detailValueContainer}>
                  <Text style={styles.detailValue}>
                    {orderData.order_id ? `${orderData.order_id}` : 'please wait...'}
                  </Text>
                  <TouchableOpacity style={styles.copyButton}>
                    <Copy size={16} color="#666666" />
                  </TouchableOpacity>
                </View>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Booking Status</Text>
                <Text style={[styles.detailValue, styles.statusSuccess]}>{getOrderStatus()}</Text>
              </View>

              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Trip Type</Text>
                <Text style={styles.detailValue}>
                  {orderData.trip_type || 'STANDARD RENTAL'}
                </Text>
              </View>

              {/* <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>SEND TO</Text>
                <Text style={styles.detailValue}>
                  {getPickupCity() !== 'N/A' ? getPickupCity() : 'ALL DRIVERS'}
                </Text>
              </View> */}

              {/* Trip Details based on type */}
              {isHourlyRental ? (
                <>
                  <View style={styles.sectionDivider} />
                  
                  {orderData.trip_time && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Package Duration</Text>
                      <Text style={styles.detailValue}>{orderData.trip_time} hours</Text>
                    </View>
                  )}

                  {orderData.vendor_price && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Customer Amount</Text>
                      <Text style={styles.detailValue}>₹{orderData.vendor_price}</Text>
                    </View>
                  )}

                  {/* {orderData.estimated_price && (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Customer Price</Text>
                      <Text style={styles.detailValue}>₹{orderData.estimated_price}</Text>
                    </View>
                  )} */}
                </>
              ) : (
                /* Regular Trip Details */
                hasFareDetails() && (
                  <>
                    <View style={styles.sectionDivider} />
                    
                    {orderData.fare.total_km && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Distance</Text>
                        <Text style={styles.detailValue}>{orderData.fare.total_km} km</Text>
                      </View>
                    )}

                    {orderData.fare.trip_time && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Duration</Text>
                        <Text style={styles.detailValue}>{orderData.fare.trip_time}</Text>
                      </View>
                    )}

                    {orderData.fare.base_km_amount && (
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Customer Fare</Text>
                        <Text style={styles.detailValue}>₹{orderData.fare.total_amount}</Text>
                      </View>
                    )}
                  </>
                )
              )}
            </View>

            {/* Action Buttons */}
            <View style={styles.actionContainer}>
              {/* Send this booking straight to one driver by ID (backend: POST /orders/{id}/manual-assign). The modal and
                  its styles existed but nothing ever opened it, so the feature was unreachable. */}
              {!!orderData.order_id && (
                <TouchableOpacity
                  style={styles.manualAssignButton}
                  onPress={() => setShowManualAssignModal(true)}
                >
                  <UserCheck size={18} color="#1D4ED8" />
                  <Text style={styles.manualAssignButtonText}>Assign to a specific driver</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity style={styles.doneButton} onPress={handleOrderPress}>
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </ScrollView>
        <ManualAssignModal
          visible={showManualAssignModal}
          onClose={() => setShowManualAssignModal(false)}
          orderId={orderData.order_id ?? null}
          onSuccess={() => { setShowManualAssignModal(false); }}
        />
      </SafeAreaView>
    </Modal>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  backButton: {
    padding: 8,
  },
  scrollContainer: {
    flex: 1,
  },
  successSection: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  checkmarkContainer: {
    marginBottom: 20,
  },
  checkmarkCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#00C851',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#00C851',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  successTitle: {
    fontSize: 24,
    fontWeight: '600',
    color: '#000000',
    textAlign: 'center',
  },
  successSubtitle: {
    fontSize: 16,
    color: '#666666',
    textAlign: 'center',
    marginTop: 8,
  },
  contentContainer: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  amountCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E8E8E8',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  amountHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  amountValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000000',
  },
  expandButton: {
    padding: 4,
  },
  expandIcon: {
    fontSize: 16,
    color: '#666666',
    fontWeight: 'bold',
  },
  customerName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000000',
    marginBottom: 4,
  },
  orderDate: {
    fontSize: 14,
    color: '#666666',
  },
  detailsContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E8E8E8',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  detailLabel: {
    fontSize: 14,
    color: '#666666',
    flex: 1,
  },
  detailValue: {
    fontSize: 14,
    color: '#000000',
    fontWeight: '500',
    textAlign: 'right',
  },
  detailValueContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  copyButton: {
    marginLeft: 8,
    padding: 4,
  },
  statusSuccess: {
    color: '#00C851',
    fontWeight: '600',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#E8E8E8',
    marginVertical: 8,
  },
  actionContainer: {
    flexDirection: 'row',
    gap: 12,
  },
  shareButton: {
    flex: 1,
    backgroundColor: '#F5F5F5',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  shareButtonText: {
    fontSize: 16,
    color: '#000000',
    fontWeight: '500',
  },
  manualAssignButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: '#BFDBFE',
    paddingVertical: 14,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  manualAssignButtonText: {
    fontSize: 15,
    color: '#1D4ED8',
    fontWeight: '700',
    fontFamily: 'Inter-Bold',
  },
  doneButton: {
    flex: 1,
    backgroundColor: '#007AFF',
    paddingVertical: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  doneButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontWeight: '600',
  },
});

export default OrderSuccess;