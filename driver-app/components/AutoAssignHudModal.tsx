import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Vibration,
  Platform,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import {
  Zap,
  MapPin,
  Clock,
  Car,
  User,
  AlertTriangle,
  CheckCircle,
  XCircle,
  ShieldAlert,
} from 'lucide-react-native';

export interface AutoAssignHudProps {
  visible: boolean;
  order?: {
    order_id: number | string;
    pickup: string;
    drop: string;
    fare: number;
    distance?: string | number;
    car_type?: string;
  };
  assignedDriverName?: string;
  assignedCarNumber?: string;
  onDecline: () => void;
  onAutoAssign: () => void;
  onClose: () => void;
}

export default function AutoAssignHudModal({
  visible,
  order = {
    order_id: 10892,
    pickup: 'Chennai',
    drop: 'Bangalore',
    fare: 4250,
    distance: '345 km',
    car_type: 'Sedan',
  },
  assignedDriverName = 'Driver',
  assignedCarNumber = 'TN-01-AB-1234',
  onDecline,
  onAutoAssign,
  onClose,
}: AutoAssignHudProps) {
  const [secondsLeft, setSecondsLeft] = useState(10);
  const [isAssigned, setIsAssigned] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(1)).current;
  const timerRef = useRef<any>(null);

  useEffect(() => {
    if (visible) {
      setSecondsLeft(10);
      setIsAssigned(false);
      progressAnim.setValue(1);

      // Pulse animation for HUD alert
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.12, duration: 500, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 500, useNativeDriver: true }),
        ])
      ).start();

      // Countdown progress bar animation
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: 10000,
        useNativeDriver: false,
      }).start();

      // Haptic/vibrate alert
      try {
        if (Platform.OS !== 'web') {
          Vibration.vibrate([0, 250, 100, 250]);
        }
      } catch {}

      // 1-second countdown ticker
      let count = 10;
      timerRef.current = setInterval(() => {
        count -= 1;
        setSecondsLeft(count);
        if (count <= 0) {
          clearInterval(timerRef.current);
          setIsAssigned(true);
          try {
            if (Platform.OS !== 'web') {
              Vibration.vibrate(400);
            }
          } catch {}
          onAutoAssign();
        }
      }, 1000);
    }

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [visible]);

  const handleDeclinePress = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    onDecline();
  };

  const handleInstantAccept = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    setIsAssigned(true);
    onAutoAssign();
  };

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleDeclinePress}>
      <View style={styles.overlayBackdrop}>
        <View style={styles.hudCard}>
          {/* Cyber Futuristic Top Glow Header */}
          <View style={styles.beaconHeader}>
            <Animated.View style={[styles.beaconDot, { transform: [{ scale: pulseAnim }] }]} />
            <Text style={styles.beaconText}>ROUTE REQUEST MATCH DETECTED</Text>
          </View>

          {/* Countdown Ring / Display */}
          {!isAssigned ? (
            <View style={styles.countdownSection}>
              <Animated.View style={[styles.timerCircle, { transform: [{ scale: pulseAnim }] }]}>
                <Text style={styles.timerNumber}>{secondsLeft}</Text>
                <Text style={styles.timerLabel}>SECONDS</Text>
              </Animated.View>
              <Text style={styles.timerSubtitle}>Auto-assigning in {secondsLeft} seconds...</Text>

              {/* Progress bar */}
              <View style={styles.progressTrack}>
                <Animated.View
                  style={[
                    styles.progressBar,
                    {
                      width: progressAnim.interpolate({
                        inputRange: [0, 1],
                        outputRange: ['0%', '100%'],
                      }),
                    },
                  ]}
                />
              </View>
            </View>
          ) : (
            <View style={styles.assignedBadgeContainer}>
              <CheckCircle size={48} color="#10B981" />
              <Text style={styles.assignedTitle}>Ride Auto-Assigned!</Text>
              <Text style={styles.assignedSubtitle}>
                Trip successfully locked and moved to Upcoming ➔ Assigned.
              </Text>
            </View>
          )}

          {/* Ride Details Card */}
          <View style={styles.detailsCard}>
            <View style={styles.routeRow}>
              <View style={styles.routeCol}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MapPin size={16} color="#10B981" />
                  <Text style={styles.cityName}>{order.pickup}</Text>
                </View>
              </View>
              <View style={styles.arrowBetween}>
                <Text style={{ color: '#6366F1', fontWeight: '700' }}>➔</Text>
              </View>
              <View style={styles.routeCol}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MapPin size={16} color="#EF4444" />
                  <Text style={styles.cityName}>{order.drop}</Text>
                </View>
              </View>
            </View>

            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Car size={14} color="#94A3B8" />
                <Text style={styles.infoText}>{order.car_type || 'Sedan'}</Text>
              </View>
              <View style={styles.infoItem}>
                <Clock size={14} color="#94A3B8" />
                <Text style={styles.infoText}>{order.distance || 'One Way'}</Text>
              </View>
              <View style={styles.infoItem}>
                <Text style={styles.fareHighlight}>₹{order.fare.toLocaleString()}</Text>
              </View>
            </View>

            <View style={styles.assignedDriverStrip}>
              <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 8 }}>
                <User size={13} color="#6366F1" />
                <Text style={[styles.driverText, { flexShrink: 1 }]}>{assignedDriverName}</Text>
              </View>
              <Text style={styles.vehicleText}>{assignedCarNumber}</Text>
            </View>
          </View>

          {/* ₹500 Warning / Fine Badge */}
          <View style={styles.penaltyAlert}>
            <ShieldAlert size={16} color="#F59E0B" />
            <Text style={styles.penaltyAlertText}>
              {isAssigned
                ? '⚠️ Booking is assigned. Cancelling now will incur a ₹500 penalty.'
                : 'Decline is FREE during the 10s countdown. Post-assignment cancel fee: ₹500.'}
            </Text>
          </View>

          {/* Action Buttons */}
          {!isAssigned ? (
            <View style={styles.btnRow}>
              <TouchableOpacity
                onPress={handleDeclinePress}
                style={styles.declineBtn}
                activeOpacity={0.8}
              >
                <XCircle size={18} color="#EF4444" />
                <Text style={styles.declineBtnText}>Decline ({secondsLeft}s)</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleInstantAccept}
                style={styles.acceptBtn}
                activeOpacity={0.85}
              >
                <Zap size={18} color="#FFFFFF" />
                <Text style={styles.acceptBtnText}>Accept Now</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <TouchableOpacity onPress={onClose} style={styles.doneBtn} activeOpacity={0.85}>
              <Text style={styles.doneBtnText}>View in Upcoming Rides</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlayBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(10, 15, 30, 0.94)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  hudCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#0F172A',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1.5,
    borderColor: '#6366F1',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 25,
    elevation: 20,
  },
  beaconHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
  },
  beaconDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  beaconText: {
    color: '#A5B4FC',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    letterSpacing: 1.2,
  },
  countdownSection: {
    alignItems: 'center',
    marginBottom: 18,
  },
  timerCircle: {
    width: 88,
    height: 88,
    borderRadius: 44,
    borderWidth: 3,
    borderColor: '#6366F1',
    backgroundColor: '#1E1B4B',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6366F1',
    shadowOpacity: 0.7,
    shadowRadius: 12,
    marginBottom: 8,
  },
  timerNumber: {
    color: '#FFFFFF',
    fontSize: 34,
    fontFamily: 'Inter-Bold',
    lineHeight: 38,
  },
  timerLabel: {
    color: '#818CF8',
    fontSize: 9,
    fontFamily: 'Inter-Bold',
    letterSpacing: 1,
  },
  timerSubtitle: {
    color: '#94A3B8',
    fontSize: 12.5,
    fontFamily: 'Inter-Medium',
    marginBottom: 10,
  },
  progressTrack: {
    width: '100%',
    height: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressBar: {
    height: '100%',
    backgroundColor: '#6366F1',
    borderRadius: 3,
  },
  assignedBadgeContainer: {
    alignItems: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  assignedTitle: {
    color: '#10B981',
    fontSize: 20,
    fontFamily: 'Inter-Bold',
  },
  assignedSubtitle: {
    color: '#94A3B8',
    fontSize: 12,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    marginBottom: 6,
  },
  detailsCard: {
    backgroundColor: '#1E293B',
    borderRadius: 8,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    marginBottom: 14,
  },
  routeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.06)',
    marginBottom: 10,
  },
  routeCol: {
    flex: 1,
  },
  arrowBetween: {
    paddingHorizontal: 8,
  },
  cityName: {
    color: '#F8FAFC',
    fontSize: 14.5,
    flexShrink: 1,
    fontFamily: 'Inter-Bold',
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  infoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flexShrink: 1,
  },
  infoText: {
    color: '#CBD5E1',
    fontSize: 12,
    flexShrink: 1,
    fontFamily: 'Inter-Medium',
  },
  fareHighlight: {
    color: '#10B981',
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  assignedDriverStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(99, 102, 241, 0.1)',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  driverText: {
    color: '#C7D2FE',
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  vehicleText: {
    color: '#E0E7FF',
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },
  penaltyAlert: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#78350F25',
    borderWidth: 1,
    borderColor: '#B4530940',
    borderRadius: 6,
    padding: 10,
    marginBottom: 16,
  },
  penaltyAlertText: {
    flex: 1,
    color: '#FCD34D',
    fontSize: 11,
    fontFamily: 'Inter-Medium',
    lineHeight: 15,
  },
  btnRow: {
    flexDirection: 'row',
    gap: 12,
  },
  declineBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#EF4444',
    backgroundColor: 'rgba(239, 68, 68, 0.08)',
  },
  declineBtnText: {
    color: '#EF4444',
    fontFamily: 'Inter-Bold',
    fontSize: 13.5,
  },
  acceptBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 13,
    borderRadius: 14,
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
  },
  acceptBtnText: {
    color: '#FFFFFF',
    fontFamily: 'Inter-Bold',
    fontSize: 14,
  },
  doneBtn: {
    backgroundColor: '#6366F1',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneBtnText: {
    color: '#FFFFFF',
    fontFamily: 'Inter-Bold',
    fontSize: 14.5,
  },
});
