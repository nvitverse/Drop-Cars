import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { useTheme } from '@/contexts/ThemeContext';
import { MapPin, Check, RefreshCw, Car, User } from 'lucide-react-native';

interface StillWaitingModalProps {
  visible: boolean;
  city: string;
  driverName?: string;
  carNumber?: string;
  onConfirmYes: () => void;
  onUpdate: () => void;
}

export default function StillWaitingModal({
  visible,
  city,
  driverName,
  carNumber,
  onConfirmYes,
  onUpdate,
}: StillWaitingModalProps) {
  const { colors, isDarkMode } = useTheme();
  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
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
    } else {
      scaleAnim.setValue(0.85);
      opacityAnim.setValue(0);
    }
  }, [visible]);

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onUpdate}
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
          {/* Header Icon Badge */}
          <View
            style={[
              styles.iconBadge,
              {
                backgroundColor: isDarkMode ? 'rgba(59, 130, 246, 0.2)' : 'rgba(59, 130, 246, 0.1)',
                borderColor: isDarkMode ? '#3B82F6' : '#60A5FA',
              },
            ]}
          >
            <MapPin size={32} color={colors.primary} />
          </View>

          {/* Title & Description */}
          <Text style={[styles.title, { color: colors.text }]}>
            Still waiting at {city}?
          </Text>
          <Text style={[styles.description, { color: colors.textSecondary }]}>
            Your vacant location update was logged over 12 hours ago. Are you still available for trips in {city}?
          </Text>

          {/* Active Driver / Vehicle Tag */}
          {(driverName || carNumber) && (
            <View
              style={[
                styles.infoCard,
                {
                  backgroundColor: isDarkMode ? '#0F172A' : '#F8FAFC',
                  borderColor: isDarkMode ? '#334155' : '#E2E8F0',
                },
              ]}
            >
              {driverName && (
                <View style={styles.infoRow}>
                  <User size={14} color={colors.primary} />
                  <Text style={[styles.infoText, { color: colors.text }]}>
                    Driver: <Text style={{ fontFamily: 'Inter-Bold' }}>{driverName}</Text>
                  </Text>
                </View>
              )}
              {carNumber && (
                <View style={styles.infoRow}>
                  <Car size={14} color={colors.primary} />
                  <Text style={[styles.infoText, { color: colors.text }]}>
                    Vehicle: <Text style={{ fontFamily: 'Inter-Bold' }}>{carNumber}</Text>
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              activeOpacity={0.85}
              style={[styles.primaryButton, { backgroundColor: colors.primary }]}
              onPress={onConfirmYes}
            >
              <Check size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
              <Text style={styles.primaryButtonText}>Yes, Still Waiting</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              style={[
                styles.secondaryButton,
                {
                  backgroundColor: isDarkMode ? '#334155' : '#F1F5F9',
                  borderColor: colors.border,
                },
              ]}
              onPress={onUpdate}
            >
              <RefreshCw size={16} color={colors.text} style={{ marginRight: 6 }} />
              <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
                Update Vacant Status
              </Text>
            </TouchableOpacity>
          </View>
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
    borderRadius: 22,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    elevation: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  iconBadge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    borderWidth: 1,
  },
  title: {
    fontSize: 19,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  description: {
    fontSize: 13.5,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 16,
  },
  infoCard: {
    width: '100%',
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 18,
    gap: 6,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  infoText: {
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  buttonContainer: {
    width: '100%',
    gap: 10,
  },
  primaryButton: {
    width: '100%',
    paddingVertical: 14,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 3,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
  },
  secondaryButton: {
    width: '100%',
    paddingVertical: 12,
    borderRadius: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
});
