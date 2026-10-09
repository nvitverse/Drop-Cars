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
import { useRouter } from 'expo-router';
import {
  ShieldAlert,
  Wallet,
  FileText,
  AlertCircle,
  ArrowRight,
  X,
  Car,
  Clock,
} from 'lucide-react-native';

export type ErrorType =
  | 'KYC_REQUIRED'
  | 'INSUFFICIENT_BALANCE'
  | 'DOCUMENT_EXPIRED'
  | 'MAX_BOOKINGS_REACHED'
  | 'GENERIC';

interface ActionableErrorModalProps {
  visible: boolean;
  errorType?: ErrorType;
  title: string;
  message: string;
  actionText?: string;
  actionRoute?: string;
  onClose: () => void;
}

export default function ActionableErrorModal({
  visible,
  errorType = 'GENERIC',
  title,
  message,
  actionText,
  actionRoute,
  onClose,
}: ActionableErrorModalProps) {
  const { colors, isDarkMode } = useTheme();
  const router = useRouter();
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

  const handleAction = () => {
    onClose();
    if (actionRoute) {
      router.push(actionRoute as any);
    }
  };

  // Determine Icon & Default Action Info based on Error Type
  const getModalConfig = () => {
    switch (errorType) {
      case 'KYC_REQUIRED':
        return {
          icon: <ShieldAlert size={28} color="#EF4444" />,
          bgColor: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
          borderColor: '#FCA5A5',
          defaultActionText: 'Complete KYC Now',
          defaultRoute: '/(tabs)/settings',
        };
      case 'INSUFFICIENT_BALANCE':
        return {
          icon: <Wallet size={28} color="#F59E0B" />,
          bgColor: isDarkMode ? 'rgba(245, 158, 11, 0.15)' : '#FFFBEB',
          borderColor: '#FCD34D',
          defaultActionText: 'Add Money to Wallet',
          defaultRoute: '/(tabs)/wallet',
        };
      case 'DOCUMENT_EXPIRED':
        return {
          icon: <Car size={28} color="#F97316" />,
          bgColor: isDarkMode ? 'rgba(249, 115, 22, 0.15)' : '#FFEDD5',
          borderColor: '#FDBA74',
          defaultActionText: 'Update Documents',
          defaultRoute: '/my-cars',
        };
      case 'MAX_BOOKINGS_REACHED':
        return {
          icon: <Clock size={28} color="#3B82F6" />,
          bgColor: isDarkMode ? 'rgba(59, 130, 246, 0.15)' : '#EFF6FF',
          borderColor: '#93C5FD',
          defaultActionText: 'Go to Active Rides',
          defaultRoute: '/(tabs)/future-rides',
        };
      default:
        return {
          icon: <AlertCircle size={28} color="#EF4444" />,
          bgColor: isDarkMode ? 'rgba(239, 68, 68, 0.15)' : '#FEF2F2',
          borderColor: '#FCA5A5',
          defaultActionText: undefined,
          defaultRoute: undefined,
        };
    }
  };

  const config = getModalConfig();
  const finalActionText = actionText || config.defaultActionText;
  const finalActionRoute = actionRoute || config.defaultRoute;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
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
          {/* Close Button */}
          <TouchableOpacity
            style={[
              styles.closeButton,
              { backgroundColor: isDarkMode ? '#334155' : '#F1F5F9' },
            ]}
            onPress={onClose}
          >
            <X size={18} color={colors.textSecondary} />
          </TouchableOpacity>

          {/* Header Icon Badge */}
          <View
            style={[
              styles.iconBadge,
              { backgroundColor: config.bgColor, borderColor: config.borderColor },
            ]}
          >
            {config.icon}
          </View>

          {/* Title & Detailed Message */}
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {message}
          </Text>

          {/* Action Buttons */}
          <View style={styles.buttonRow}>
            {finalActionText && finalActionRoute ? (
              <>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[
                    styles.primaryButton,
                    { backgroundColor: colors.primary },
                  ]}
                  onPress={handleAction}
                >
                  <Text style={styles.primaryButtonText}>{finalActionText}</Text>
                  <ArrowRight size={18} color="#FFFFFF" style={{ marginLeft: 6 }} />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[
                    styles.secondaryButton,
                    {
                      backgroundColor: isDarkMode ? '#334155' : '#F1F5F9',
                      borderColor: colors.border,
                    },
                  ]}
                  onPress={onClose}
                >
                  <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
                    Dismiss
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <TouchableOpacity
                activeOpacity={0.8}
                style={[
                  styles.primaryButton,
                  { backgroundColor: colors.primary, width: '100%' },
                ]}
                onPress={onClose}
              >
                <Text style={styles.primaryButtonText}>OK</Text>
              </TouchableOpacity>
            )}
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
    borderRadius: 20,
    padding: 22,
    alignItems: 'center',
    borderWidth: 1,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    position: 'relative',
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    right: 14,
    padding: 6,
    borderRadius: 10,
  },
  iconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
    borderWidth: 1,
  },
  title: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 20,
  },
  buttonRow: {
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
    elevation: 2,
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
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
  },
});
