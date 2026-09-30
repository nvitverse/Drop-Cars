import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  PanResponder,
  Animated,
  Dimensions,
  Modal,
} from 'react-native';
import { useRouter, usePathname } from 'expo-router';
import {
  ShieldCheck,
  Clock,
  MessageSquare,
  ClipboardCheck,
  Power,
  X,
  Lock,
  ChevronUp,
  ChevronDown,
  Activity,
  Zap,
} from 'lucide-react-native';
import { useStaffDuty } from '@/context/StaffDutyContext';
import { useTheme } from '@/context/ThemeContext';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

function formatTime(seconds: number): string {
  const hrs = Math.floor(seconds / 3600);
  const mins = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hrs > 0) {
    return `${hrs}h ${mins}m`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export default function StaffDutyFloatingBubble() {
  const router = useRouter();
  const pathname = usePathname();
  const { isDark, themeColors } = useTheme();
  const {
    isOnDuty,
    dutyStatus,
    dutySeconds,
    activeSeconds,
    idleSeconds,
    isBubbleVisible,
    isBubbleCompulsory,
    leadsHandledToday,
    toggleDuty,
    dismissBubble,
  } = useStaffDuty();

  const [expanded, setExpanded] = useState(false);

  // NEVER show on login screen or if duty is not active
  if (!pathname || pathname === '/login' || pathname.includes('login') || !isOnDuty || !isBubbleVisible) {
    return null;
  }

  // Position animated value
  const pan = useRef(new Animated.ValueXY({ x: SCREEN_WIDTH - 80, y: SCREEN_HEIGHT - 220 })).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dx) > 2 || Math.abs(gestureState.dy) > 2;
      },
      onPanResponderGrant: () => {
        pan.setOffset({
          x: (pan.x as any)._value || 0,
          y: (pan.y as any)._value || 0,
        });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], {
        useNativeDriver: false,
      }),
      onPanResponderRelease: () => {
        pan.flattenOffset();
      },
    })
  ).current;

  if (!isOnDuty || !isBubbleVisible) {
    return null;
  }

  const statusColor =
    dutyStatus === 'active' ? '#10B981' : dutyStatus === 'idle' ? '#F59E0B' : '#EF4444';
  const statusLabel =
    dutyStatus === 'active' ? 'ONLINE' : dutyStatus === 'idle' ? 'IDLE' : 'OFF';

  return (
    <>
      <Animated.View
        style={[
          styles.bubbleContainer,
          {
            transform: [{ translateX: pan.x }, { translateY: pan.y }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setExpanded(true)}
          style={[
            styles.bubbleCircle,
            {
              backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
              borderColor: statusColor,
              shadowColor: statusColor,
            },
          ]}
        >
          <View style={[styles.pulseRing, { backgroundColor: statusColor }]} />
          <Activity size={18} color={statusColor} />
          <Text style={[styles.bubbleTimeText, { color: isDark ? '#F1F5F9' : '#0F172A' }]}>
            {formatTime(activeSeconds)}
          </Text>
          <View style={[styles.miniStatusBadge, { backgroundColor: statusColor }]}>
            <Text style={styles.miniStatusText}>{statusLabel}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>

      {/* Expanded Modal Dashboard */}
      <Modal
        visible={expanded}
        transparent
        animationType="fade"
        onRequestClose={() => setExpanded(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.modalCard,
              {
                backgroundColor: themeColors.surface,
                borderColor: themeColors.border,
              },
            ]}
          >
            {/* Header */}
            <View style={styles.cardHeader}>
              <View style={styles.headerLeft}>
                <View style={[styles.indicatorDot, { backgroundColor: statusColor }]} />
                <View>
                  <Text style={[styles.cardTitle, { color: themeColors.text }]}>
                    Staff Duty & Productivity Tracker
                  </Text>
                  <Text style={[styles.cardSub, { color: themeColors.textSecondary }]}>
                    Status: <Text style={{ color: statusColor, fontWeight: '700' }}>{statusLabel}</Text>
                    {isBubbleCompulsory ? ' • 🔒 WFH Compulsory' : ''}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setExpanded(false)}
                style={[styles.closeIconBtn, { backgroundColor: isDark ? '#334155' : '#F1F5F9' }]}
              >
                <X size={18} color={themeColors.text} />
              </TouchableOpacity>
            </View>

            {/* Metrics Grid */}
            <View style={styles.metricsGrid}>
              <View
                style={[
                  styles.metricBox,
                  { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: themeColors.border },
                ]}
              >
                <Clock size={16} color="#3B82F6" />
                <Text style={[styles.metricLabel, { color: themeColors.textSecondary }]}>
                  Active Work
                </Text>
                <Text style={[styles.metricValue, { color: '#3B82F6' }]}>
                  {formatTime(activeSeconds)}
                </Text>
              </View>

              <View
                style={[
                  styles.metricBox,
                  { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: themeColors.border },
                ]}
              >
                <Activity size={16} color="#F59E0B" />
                <Text style={[styles.metricLabel, { color: themeColors.textSecondary }]}>
                  Idle Time
                </Text>
                <Text style={[styles.metricValue, { color: '#F59E0B' }]}>
                  {formatTime(idleSeconds)}
                </Text>
              </View>

              <View
                style={[
                  styles.metricBox,
                  { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: themeColors.border },
                ]}
              >
                <MessageSquare size={16} color="#10B981" />
                <Text style={[styles.metricLabel, { color: themeColors.textSecondary }]}>
                  Leads Handled
                </Text>
                <Text style={[styles.metricValue, { color: '#10B981' }]}>
                  {leadsHandledToday}
                </Text>
              </View>
            </View>

            {/* Quick Navigation Actions */}
            <View style={styles.actionButtonsCol}>
              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#3B82F6' }]}
                onPress={() => {
                  setExpanded(false);
                  router.push('/crm' as any);
                }}
              >
                <MessageSquare size={16} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Go to CRM & Inbound Leads</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#8B5CF6' }]}
                onPress={() => {
                  setExpanded(false);
                  router.push('/website-booking-approvals' as any);
                }}
              >
                <ClipboardCheck size={16} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Booking Approvals</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.actionBtn, { backgroundColor: '#EF4444' }]}
                onPress={() => {
                  setExpanded(false);
                  toggleDuty(false);
                }}
              >
                <Power size={16} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>End Duty (Go Offline)</Text>
              </TouchableOpacity>

              {!isBubbleCompulsory && (
                <TouchableOpacity
                  style={[
                    styles.secondaryBtn,
                    { borderColor: themeColors.border, backgroundColor: themeColors.background },
                  ]}
                  onPress={() => {
                    setExpanded(false);
                    dismissBubble();
                  }}
                >
                  <Text style={[styles.secondaryBtnText, { color: themeColors.textSecondary }]}>
                    Minimize Floating Bubble
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bubbleContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    zIndex: 99999,
  },
  bubbleCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    borderWidth: 2.5,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 10,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
  },
  pulseRing: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  bubbleTimeText: {
    fontSize: 10.5,
    fontWeight: '800',
    marginTop: 2,
  },
  miniStatusBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
    marginTop: 1,
  },
  miniStatusText: {
    fontSize: 7.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 380,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    elevation: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  indicatorDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '800',
  },
  cardSub: {
    fontSize: 12,
    marginTop: 1,
  },
  closeIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  metricsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  metricBox: {
    flex: 1,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    gap: 4,
  },
  metricLabel: {
    fontSize: 10.5,
    fontWeight: '600',
  },
  metricValue: {
    fontSize: 15,
    fontWeight: '800',
  },
  actionButtonsCol: {
    gap: 8,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 10,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '700',
  },
  secondaryBtn: {
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    marginTop: 4,
  },
  secondaryBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
