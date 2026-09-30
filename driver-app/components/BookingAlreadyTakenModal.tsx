import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
} from 'react-native';
import { useTheme } from '@/contexts/ThemeContext';
import { RefreshCw, AlertCircle, Check } from 'lucide-react-native';

interface BookingAlreadyTakenModalProps {
  visible: boolean;
  onClose: () => void;
  onRefresh?: () => void;
}

export default function BookingAlreadyTakenModal({
  visible,
  onClose,
  onRefresh,
}: BookingAlreadyTakenModalProps) {
  const { colors, isDarkMode } = useTheme();
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const spinAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      // Entrance animation
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 6,
          tension: 80,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // Continuous spin animation for refresh icon
      spinAnim.setValue(0);
      Animated.loop(
        Animated.timing(spinAnim, {
          toValue: 1,
          duration: 2000,
          easing: Easing.linear,
          useNativeDriver: true,
        })
      ).start();
    } else {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  if (!visible) return null;

  const spin = spinAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const handleDismiss = () => {
    onClose();
    if (onRefresh) {
      onRefresh();
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleDismiss}
    >
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.modalContainer,
            {
              backgroundColor: isDarkMode ? '#1E293B' : '#FFFFFF',
              borderColor: isDarkMode ? '#334155' : '#E2E8F0',
              transform: [{ scale: scaleAnim }],
              opacity: opacityAnim,
            },
          ]}
        >
          {/* Animated Header Badge */}
          <View style={styles.badgeWrapper}>
            <View style={[styles.outerRing, { backgroundColor: isDarkMode ? 'rgba(245, 158, 11, 0.15)' : 'rgba(245, 158, 11, 0.1)' }]}>
              <View style={[styles.innerCircle, { backgroundColor: '#F59E0B' }]}>
                <Animated.View style={{ transform: [{ rotate: spin }] }}>
                  <RefreshCw size={26} color="#FFFFFF" />
                </Animated.View>
              </View>
            </View>
          </View>

          {/* Title & Description */}
          <Text style={[styles.title, { color: colors.text }]}>
            Booking Already Taken
          </Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            Another vendor has accepted this trip just a moment ago. We are automatically refreshing your available bookings list.
          </Text>

          {/* Theme-aware status bar */}
          <View style={[styles.statusBanner, { backgroundColor: isDarkMode ? '#0F172A' : '#F8FAFC', borderColor: isDarkMode ? '#1E293B' : '#E2E8F0' }]}>
            <AlertCircle size={16} color={colors.primary} />
            <Text style={[styles.statusText, { color: colors.text }]}>
              Updating feed with live orders...
            </Text>
          </View>

          {/* Action Button */}
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.actionButton, { backgroundColor: colors.primary }]}
            onPress={handleDismiss}
          >
            <Check size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
            <Text style={styles.actionButtonText}>Got It, Refresh List</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  badgeWrapper: {
    marginBottom: 16,
  },
  outerRing: {
    padding: 10,
    borderRadius: 50,
  },
  innerCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.4,
    shadowRadius: 6,
  },
  title: {
    fontSize: 19,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  statusBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    width: '100%',
    marginBottom: 20,
  },
  statusText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  actionButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 2,
  },
  actionButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
});
