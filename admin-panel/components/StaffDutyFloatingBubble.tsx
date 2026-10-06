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
  Clock,
  MessageSquare,
  ClipboardCheck,
  Power,
  X,
  Activity,
  Zap,
  Coffee,
  BellOff,
  Inbox,
  Users,
} from 'lucide-react-native';
import { useStaffDuty } from '@/context/StaffDutyContext';
import { useTheme } from '@/context/ThemeContext';
import DutySignOffModal from '@/components/DutySignOffModal';
import StaffWelcomeShiftModal from '@/components/StaffWelcomeShiftModal';

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

const BUBBLE_SIZE = 52;
const PADDING = 12;

export default function StaffDutyFloatingBubble() {
  const router = useRouter();
  const pathname = usePathname();
  const { isDark, themeColors } = useTheme();
  const {
    isOnDuty,
    dutyStatus,
    isOnBreak,
    breakRemainingSeconds,
    dutySeconds,
    activeSeconds,
    idleSeconds,
    isBubbleCompulsory,
    leadsHandledToday,
    toggleDuty,
    startBreak,
    resumeFromBreak,
    dismissBubble,
  } = useStaffDuty();

  const [expanded, setExpanded] = useState(false);
  const [showSignOffModal, setShowSignOffModal] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [showBreakModal, setShowBreakModal] = useState(false);
  const [selectedBreakDuration, setSelectedBreakDuration] = useState<number>(30);

  // Position animated value (clamped initial position)
  const pan = useRef(new Animated.ValueXY({ x: SCREEN_WIDTH - BUBBLE_SIZE - PADDING, y: SCREEN_HEIGHT - 220 })).current;

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
        const currentX = (pan.x as any)._value || 0;
        const currentY = (pan.y as any)._value || 0;

        const minX = PADDING;
        const maxX = SCREEN_WIDTH - BUBBLE_SIZE - PADDING;
        const minY = 60;
        const maxY = SCREEN_HEIGHT - BUBBLE_SIZE - 90;

        const clampedX = Math.max(minX, Math.min(maxX, currentX));
        const clampedY = Math.max(minY, Math.min(maxY, currentY));

        Animated.spring(pan, {
          toValue: { x: clampedX, y: clampedY },
          useNativeDriver: false,
          friction: 6,
          tension: 50,
        }).start();
      },
    })
  ).current;

  // NEVER show on login screen
  if (!pathname || pathname === '/login' || pathname.includes('login')) {
    return null;
  }

  // Bubble colors & labels depending on duty & break state
  const bubbleBorderColor = !isOnDuty ? '#10B981' : isOnBreak ? '#F97316' : '#F59E0B';
  const bubbleTextColor = !isOnDuty
    ? (isDark ? '#34D399' : '#059669')
    : isOnBreak
    ? (isDark ? '#FB923C' : '#EA580C')
    : (isDark ? '#FBBF24' : '#D97706');
  const bubbleLabel = !isOnDuty
    ? 'GO ON'
    : isOnBreak
    ? 'BREAK'
    : 'DUTY';

  const statusLabel = !isOnDuty
    ? 'OFFLINE'
    : isOnBreak
    ? 'ON BREAK'
    : dutyStatus === 'active'
    ? 'ONLINE'
    : dutyStatus === 'idle'
    ? 'IDLE'
    : 'OFFLINE';

  const statusColor = !isOnDuty
    ? '#94A3B8'
    : isOnBreak
    ? '#F97316'
    : '#10B981';

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
          onPress={() => {
            if (!isOnDuty) {
              setShowWelcomeModal(true);
            } else {
              setExpanded(true);
            }
          }}
          style={[
            styles.bubbleCircle,
            {
              backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
              borderColor: bubbleBorderColor,
              shadowColor: bubbleBorderColor,
            },
          ]}
        >
          {isOnDuty && <View style={[styles.pulseRing, { backgroundColor: bubbleBorderColor }]} />}
          {isOnBreak ? (
            <Coffee size={16} color={bubbleBorderColor} strokeWidth={2.5} />
          ) : (
            <Power size={16} color={bubbleBorderColor} strokeWidth={2.5} />
          )}
          <Text
            style={[
              styles.bubbleTimeText,
              { color: bubbleTextColor },
            ]}
          >
            {bubbleLabel}
          </Text>
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
                    Status: <Text style={{ color: statusColor, fontWeight: '800' }}>{statusLabel}</Text>
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

            {/* Break Active Banner */}
            {isOnBreak && (
              <View style={[styles.breakAlertBanner, { backgroundColor: isDark ? 'rgba(249, 115, 22, 0.15)' : '#FFF7ED', borderColor: '#FDBA74' }]}>
                <Coffee size={18} color="#EA580C" />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.breakAlertTitle, { color: '#C2410C' }]}>
                    Staff Break Active ({formatTime(breakRemainingSeconds)} left)
                  </Text>
                  <Text style={[styles.breakAlertSub, { color: '#9A3412' }]}>
                    🔕 Alarms muted · Leads logged safely to CRM
                  </Text>
                </View>
              </View>
            )}

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

            {/* Quick Navigation & Duty Actions */}
            <View style={styles.actionButtonsCol}>
              {/* 1. Go to Leads & Enquiries */}
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.actionBtn, { backgroundColor: '#3B82F6' }]}
                onPress={() => {
                  setExpanded(false);
                  router.push('/enquiries' as any);
                }}
              >
                <MessageSquare size={16} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Go to Leads & Enquiries</Text>
              </TouchableOpacity>

              {/* 2. Booking Approvals */}
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.actionBtn, { backgroundColor: '#8B5CF6' }]}
                onPress={() => {
                  setExpanded(false);
                  router.push('/website-booking-approvals' as any);
                }}
              >
                <ClipboardCheck size={16} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>Booking Approvals</Text>
              </TouchableOpacity>

              {/* 3. Take a Break / Resume Duty (Orange button placed DIRECTLY above End Duty) */}
              {isOnDuty && (
                isOnBreak ? (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[styles.actionBtn, { backgroundColor: '#10B981' }]}
                    onPress={() => {
                      resumeFromBreak();
                      setExpanded(false);
                    }}
                  >
                    <Zap size={16} color="#FFFFFF" strokeWidth={2.5} />
                    <Text style={styles.actionBtnText}>Resume Duty Now (Unmute Alarms)</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={[styles.actionBtn, { backgroundColor: '#F59E0B' }]}
                    onPress={() => {
                      setExpanded(false);
                      setShowBreakModal(true);
                    }}
                  >
                    <Coffee size={16} color="#FFFFFF" strokeWidth={2.2} />
                    <Text style={styles.actionBtnText}>Take a Break (Pause Duty)</Text>
                  </TouchableOpacity>
                )
              )}

              {/* 4. End Duty (Go Offline) */}
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.actionBtn, { backgroundColor: isOnDuty ? '#EF4444' : '#10B981' }]}
                onPress={() => {
                  setExpanded(false);
                  if (isOnDuty) {
                    setShowSignOffModal(true);
                  } else {
                    setShowWelcomeModal(true);
                  }
                }}
              >
                <Power size={16} color="#FFFFFF" />
                <Text style={styles.actionBtnText}>
                  {isOnDuty ? 'End Duty (Go Offline)' : 'Start Duty (Go Online)'}
                </Text>
              </TouchableOpacity>

              {/* 5. Minimize Option */}
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

      {/* Staff Break & Notification Explainer Modal */}
      <Modal
        visible={showBreakModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowBreakModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View
            style={[
              styles.breakModalCard,
              {
                backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
                borderColor: themeColors.border,
              },
            ]}
          >
            {/* Break Modal Header */}
            <View style={styles.breakHeader}>
              <View style={styles.breakIconCircle}>
                <Coffee size={24} color="#EA580C" />
              </View>
              <TouchableOpacity
                onPress={() => setShowBreakModal(false)}
                style={styles.closeIconBtn}
              >
                <X size={18} color="#94A3B8" />
              </TouchableOpacity>
            </View>

            <View style={styles.breakBody}>
              <Text style={[styles.breakTitle, { color: themeColors.text }]}>
                Take a Staff Break ☕
              </Text>
              <Text style={[styles.breakSub, { color: themeColors.textSecondary }]}>
                Rest and recharge! Here is how notifications are handled during your break:
              </Text>

              {/* Notification Explainer Points */}
              <View style={[styles.breakInfoBox, { backgroundColor: isDark ? '#0F172A' : '#F8FAFC', borderColor: isDark ? '#334155' : '#E2E8F0' }]}>
                <View style={styles.breakInfoRow}>
                  <View style={[styles.infoIconWrap, { backgroundColor: '#FEE2E2' }]}>
                    <BellOff size={15} color="#DC2626" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoRowTitle, { color: themeColors.text }]}>
                      Audio Alarms Muted
                    </Text>
                    <Text style={[styles.infoRowSub, { color: themeColors.textSecondary }]}>
                      Loud enquiry sirens & ringtone popups are paused during your break.
                    </Text>
                  </View>
                </View>

                <View style={styles.breakInfoRow}>
                  <View style={[styles.infoIconWrap, { backgroundColor: '#D1FAE5' }]}>
                    <Inbox size={15} color="#059669" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoRowTitle, { color: themeColors.text }]}>
                      100% Captured in CRM
                    </Text>
                    <Text style={[styles.infoRowSub, { color: themeColors.textSecondary }]}>
                      Customer leads, WhatsApp messages & bookings stay safe in your queue.
                    </Text>
                  </View>
                </View>

                <View style={styles.breakInfoRow}>
                  <View style={[styles.infoIconWrap, { backgroundColor: '#DBEAFE' }]}>
                    <Users size={15} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.infoRowTitle, { color: themeColors.text }]}>
                      Team Fallback Active
                    </Text>
                    <Text style={[styles.infoRowSub, { color: themeColors.textSecondary }]}>
                      Other active on-duty staff can cover urgent dispatches if needed.
                    </Text>
                  </View>
                </View>
              </View>

              {/* Select Break Duration */}
              <Text style={[styles.durationSectionTitle, { color: themeColors.text }]}>
                Select Break Duration:
              </Text>
              <View style={styles.durationRow}>
                {[15, 30, 60].map((dur) => {
                  const isSelected = selectedBreakDuration === dur;
                  return (
                    <TouchableOpacity
                      key={dur}
                      activeOpacity={0.8}
                      style={[
                        styles.durationPill,
                        {
                          backgroundColor: isSelected
                            ? '#EA580C'
                            : isDark
                            ? '#334155'
                            : '#F1F5F9',
                          borderColor: isSelected ? '#EA580C' : themeColors.border,
                        },
                      ]}
                      onPress={() => setSelectedBreakDuration(dur)}
                    >
                      <Text
                        style={[
                          styles.durationPillText,
                          { color: isSelected ? '#FFFFFF' : themeColors.text },
                        ]}
                      >
                        {dur === 60 ? '1 Hour' : `${dur} Mins`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Break Confirm Actions */}
              <View style={styles.breakActions}>
                <TouchableOpacity
                  activeOpacity={0.88}
                  style={[styles.startBreakConfirmBtn, { backgroundColor: '#EA580C' }]}
                  onPress={() => {
                    startBreak(selectedBreakDuration);
                    setShowBreakModal(false);
                  }}
                >
                  <Coffee size={17} color="#FFFFFF" strokeWidth={2.2} />
                  <Text style={styles.startBreakConfirmBtnText}>
                    Start {selectedBreakDuration === 60 ? '1 Hour' : `${selectedBreakDuration} Mins`} Break (Mute Alarms)
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[styles.cancelBreakBtn, { borderColor: themeColors.border }]}
                  onPress={() => setShowBreakModal(false)}
                >
                  <Text style={[styles.cancelBreakBtnText, { color: themeColors.textSecondary }]}>
                    Cancel & Continue Working
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      <StaffWelcomeShiftModal
        visible={showWelcomeModal}
        onClose={() => setShowWelcomeModal(false)}
        onStartShift={() => toggleDuty(true)}
      />

      <DutySignOffModal
        visible={showSignOffModal}
        onClose={() => setShowSignOffModal(false)}
        onConfirmOffline={() => toggleDuty(false)}
      />
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
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.35,
    shadowRadius: 6,
  },
  pulseRing: {
    position: 'absolute',
    top: 3,
    right: 3,
    width: 9,
    height: 9,
    borderRadius: 4.5,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  bubbleTimeText: {
    fontSize: 8.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '900',
    marginTop: 2,
    letterSpacing: -0.2,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    width: '100%',
    maxWidth: 390,
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    elevation: 20,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
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
  breakAlertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  breakAlertTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  breakAlertSub: {
    fontSize: 10.5,
    fontWeight: '500',
    marginTop: 1,
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
    elevation: 1,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
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
  breakModalCard: {
    width: '100%',
    maxWidth: 410,
    borderRadius: 18,
    borderWidth: 1,
    overflow: 'hidden',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
  },
  breakHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingTop: 18,
  },
  breakIconCircle: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  breakBody: {
    padding: 18,
    paddingTop: 10,
  },
  breakTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    fontWeight: '900',
    marginBottom: 4,
  },
  breakSub: {
    fontSize: 12,
    lineHeight: 17,
    marginBottom: 14,
  },
  breakInfoBox: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    gap: 10,
    marginBottom: 16,
  },
  breakInfoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  infoIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 1,
  },
  infoRowTitle: {
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
    marginBottom: 1,
  },
  infoRowSub: {
    fontSize: 11,
    fontWeight: '500',
    lineHeight: 14,
  },
  durationSectionTitle: {
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
    marginBottom: 8,
  },
  durationRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  durationPill: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationPillText: {
    fontSize: 12,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  breakActions: {
    gap: 8,
  },
  startBreakConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
  },
  startBreakConfirmBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
  },
  cancelBreakBtn: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBreakBtnText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
