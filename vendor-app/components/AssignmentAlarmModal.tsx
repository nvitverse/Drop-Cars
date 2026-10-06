import React, { useEffect, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { AlertTriangle, Clock, HelpCircle, UserCheck } from 'lucide-react-native';

interface AssignmentAlarmModalProps {
  visible: boolean;
  orderId?: string | number;
  customerName?: string;
  pickupTime?: string;
  totalTimeMins?: number;
  onAssignNow: () => void;
  onNeedHelp: () => void;
  onDismiss: () => void;
}

export default function AssignmentAlarmModal({
  visible,
  orderId,
  customerName,
  pickupTime,
  totalTimeMins = 30,
  onAssignNow,
  onNeedHelp,
  onDismiss,
}: AssignmentAlarmModalProps) {
  const [secondsRemaining, setSecondsRemaining] = useState(15);

  useEffect(() => {
    if (!visible) {
      setSecondsRemaining(15);
      return;
    }

    setSecondsRemaining(15);
    const interval = setInterval(() => {
      setSecondsRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          onDismiss();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss}>
      <View style={styles.overlay}>
        <View style={styles.alarmCard}>
          {/* Header Badge */}
          <View style={styles.badgeRow}>
            <View style={styles.alarmBadge}>
              <AlertTriangle size={20} color="#DC2626" />
              <Text style={styles.alarmBadgeText}>DRIVER ASSIGNMENT ALARM</Text>
            </View>
            <View style={styles.timerChip}>
              <Clock size={14} color="#D97706" />
              <Text style={styles.timerChipText}>{secondsRemaining}s</Text>
            </View>
          </View>

          {/* Main Info */}
          <Text style={styles.title}>50% Assignment Time Elapsed!</Text>
          <Text style={styles.subtitle}>
            Please assign a driver & car details for Order #{orderId || 'Booking'} ({customerName || 'Customer'}) to avoid auto-expiry penalty.
          </Text>

          {/* Countdown Bar */}
          <View style={styles.progressBarBg}>
            <View style={[styles.progressBarFill, { width: `${(secondsRemaining / 15) * 100}%` }]} />
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.needHelpBtn}
              activeOpacity={0.8}
              onPress={() => {
                onNeedHelp();
                Alert.alert(
                  'Support Alerted',
                  'Operational staff has been notified to help you resolve driver assignment for this booking.'
                );
              }}
            >
              <HelpCircle size={18} color="#DC2626" />
              <Text style={styles.needHelpText}>Need Help</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.assignNowBtn}
              activeOpacity={0.8}
              onPress={() => {
                onDismiss();
                onAssignNow();
              }}
            >
              <UserCheck size={18} color="#FFFFFF" />
              <Text style={styles.assignNowText}>Assign Now</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.82)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  alarmCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    borderWidth: 2,
    borderColor: '#FCA5A5',
    shadowColor: '#DC2626',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 10,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  alarmBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  alarmBadgeText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#DC2626',
    fontFamily: 'Inter-Bold',
  },
  timerChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
  },
  timerChipText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#D97706',
    fontFamily: 'Inter-Bold',
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
    fontFamily: 'Inter-Bold',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#475569',
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
    marginBottom: 14,
  },
  progressBarBg: {
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
    marginBottom: 18,
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#DC2626',
    borderRadius: 3,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
  },
  needHelpBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
    paddingVertical: 12,
    borderRadius: 12,
  },
  needHelpText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#DC2626',
    fontFamily: 'Inter-Bold',
  },
  assignNowBtn: {
    flex: 1.3,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#1D4ED8',
    paddingVertical: 12,
    borderRadius: 12,
  },
  assignNowText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Inter-Bold',
  },
});
