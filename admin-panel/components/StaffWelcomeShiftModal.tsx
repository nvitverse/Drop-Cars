import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Animated,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import {
  Sparkles,
  Zap,
  CheckCircle2,
  X,
  Target,
  Clock,
  TrendingUp,
  Award,
} from 'lucide-react-native';
import { getCachedUsername } from '@/utils/auth';
import { useTheme } from '@/context/ThemeContext';

interface StaffWelcomeShiftModalProps {
  visible: boolean;
  onClose: () => void;
  onStartShift: () => void;
  staffName?: string;
}

export default function StaffWelcomeShiftModal({
  visible,
  onClose,
  onStartShift,
  staffName,
}: StaffWelcomeShiftModalProps) {
  const { themeColors, isDark } = useTheme();
  const [resolvedName, setResolvedName] = React.useState(staffName || '');

  const scaleAnim = useRef(new Animated.Value(0.85)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (staffName) {
      setResolvedName(staffName);
    } else {
      getCachedUsername().then((name) => {
        setResolvedName(name || 'Team Member');
      });
    }
  }, [staffName, visible]);

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(scaleAnim, {
          toValue: 1,
          friction: 6,
          tension: 60,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 250,
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
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Animated.View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
              borderColor: isDark ? '#334155' : '#E2E8F0',
              opacity: opacityAnim,
              transform: [{ scale: scaleAnim }],
            },
          ]}
        >
          {/* Top Energetic Header */}
          <View style={styles.headerGradient}>
            <View style={styles.iconCircle}>
              <Sparkles size={24} color="#F59E0B" />
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={10}>
              <X size={18} color="#94A3B8" />
            </TouchableOpacity>
          </View>

          <View style={styles.body}>
            <View style={styles.badgeRow}>
              <View style={styles.heroBadge}>
                <Award size={13} color="#059669" />
                <Text style={styles.heroBadgeText}>HIGH CONVERSION SHIFT</Text>
              </View>
            </View>

            <Text style={[styles.title, { color: themeColors.text }]}>
              Ready for Shift, {resolvedName || 'Team Member'}? 🚀
            </Text>
            <Text style={[styles.subtitle, { color: themeColors.textSecondary }]}>
              Let's make today productive, delight every customer, and turn enquiries into confirmed trips!
            </Text>

            {/* Quick Shift Tips & Motivation */}
            <View
              style={[
                styles.tipBox,
                {
                  backgroundColor: isDark ? '#0F172A' : '#F8FAFC',
                  borderColor: isDark ? '#1E293B' : '#E2E8F0',
                },
              ]}
            >
              <View style={styles.tipRow}>
                <View style={[styles.tipIconBox, { backgroundColor: '#10B98118' }]}>
                  <Zap size={14} color="#10B981" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tipTitle, { color: themeColors.text }]}>Instant Audio Alarms</Text>
                  <Text style={[styles.tipDesc, { color: themeColors.textSecondary }]}>
                    Sound rings instantly for hot leads & trip messages
                  </Text>
                </View>
              </View>

              <View style={styles.tipRow}>
                <View style={[styles.tipIconBox, { backgroundColor: '#3B82F618' }]}>
                  <Target size={14} color="#3B82F6" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tipTitle, { color: themeColors.text }]}>5-Minute Golden Rule</Text>
                  <Text style={[styles.tipDesc, { color: themeColors.textSecondary }]}>
                    Speedy responses within 5 mins boost bookings by 3x
                  </Text>
                </View>
              </View>

              <View style={styles.tipRow}>
                <View style={[styles.tipIconBox, { backgroundColor: '#F59E0B18' }]}>
                  <TrendingUp size={14} color="#F59E0B" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.tipTitle, { color: themeColors.text }]}>5-Star Target Today</Text>
                  <Text style={[styles.tipDesc, { color: themeColors.textSecondary }]}>
                    Clear all pending leads to maximize your shift rating
                  </Text>
                </View>
              </View>
            </View>

            {/* Action Buttons */}
            <View style={styles.actions}>
              {/* Primary: Start Shift */}
              <TouchableOpacity
                activeOpacity={0.88}
                style={[styles.startBtn, { backgroundColor: '#10B981' }]}
                onPress={() => {
                  onStartShift();
                  onClose();
                }}
              >
                <Zap size={18} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={styles.startBtnText}>Start Shift (Go Online)</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  headerGradient: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 4,
  },
  closeBtn: {
    padding: 6,
    borderRadius: 14,
  },
  body: {
    padding: 20,
    paddingTop: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  heroBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  heroBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.3,
  },
  title: {
    fontSize: 19,
    fontFamily: 'Inter-Bold',
    fontWeight: '900',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 16,
  },
  tipBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 12,
    marginBottom: 20,
  },
  tipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tipIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    marginBottom: 1,
  },
  tipDesc: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
  },
  actions: {
    gap: 10,
  },
  startBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 3,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  startBtnText: {
    color: '#FFFFFF',
    fontSize: 14.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
