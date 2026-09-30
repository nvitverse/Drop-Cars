import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, usePathname } from 'expo-router';
import { BellRing, Car, Phone, MapPin, Calendar, IndianRupee, Zap, Clock, ChevronRight, ChevronLeft, ArrowRight, AlertTriangle } from 'lucide-react-native';
import { apiService } from '@/services/api';
import { playAlarmSound, stopAlarmSound, forceStopAlarmSound } from '@/utils/alarmSound';
import { useTheme } from '@/context/ThemeContext';

const ALERT_CUTOFF_STORAGE_KEY = 'dropcars_admin_booking_alert_cutoff_v1';

type BookingAlarmItem = {
  id: string;
  order_id?: number;
  customer_name: string;
  customer_number: string;
  pickup_drop_location: any;
  route_str?: string;
  trip_type: string;
  car_type: string;
  start_date_time: string;
  quoted_total_amount?: number | null;
  total_booking_amount?: number | null;
  source?: string;
  created_at: string;
  is_urgent: boolean;
  is_urgent_unassigned?: boolean;
  mins_to_pickup?: number;
};

function locationLabel(loc: any, routeStr?: string): string {
  if (routeStr) return routeStr;
  if (!loc) return 'N/A';
  if (loc.pickup || loc.drop) {
    const p = loc.pickup?.address || loc.pickup?.city || '?';
    const d = loc.drop?.address || loc.drop?.city || '?';
    return `${p} → ${d}`;
  }
  const keys = Object.keys(loc).sort((a, b) => Number(a) - Number(b));
  return keys.map((k) => loc[k]).join(' → ');
}

export default function BookingAlarmHost() {
  const router = useRouter();
  const pathname = usePathname();
  const { isDark, themeColors } = useTheme();

  const [queue, setQueue] = useState<BookingAlarmItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [snoozedUntil, setSnoozedUntil] = useState<Record<string, number>>({});
  const dismissedRef = useRef<Set<string>>(new Set());
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [alertCutoffMs, setAlertCutoffMs] = useState<number | null>(null);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const [isAuth, setIsAuth] = useState(false);

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const token = await AsyncStorage.getItem('auth_token');
        setIsAuth(!!token && pathname !== '/login');
      } catch {
        setIsAuth(false);
      }
    };
    checkAuth();
  }, [pathname]);

  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(ALERT_CUTOFF_STORAGE_KEY);
        if (stored) {
          setAlertCutoffMs(parseInt(stored, 10));
        } else {
          const nowMs = Date.now();
          await AsyncStorage.setItem(ALERT_CUTOFF_STORAGE_KEY, String(nowMs));
          setAlertCutoffMs(nowMs);
        }
      } catch (e) {
        setAlertCutoffMs(Date.now());
      }
    })();
  }, []);

  useEffect(() => {
    if (alertCutoffMs === null || !isAuth || pathname === '/login') {
      stopAlarmSound('booking');
      setQueue([]);
      return;
    }

    let timer: any = null;

    const checkPending = async () => {
      try {
        const [websiteList, urgentUnassignedList] = await Promise.all([
          apiService.getPendingWebsiteBookings().catch(() => []),
          apiService.getUrgentUnassignedAlarmBookings().catch(() => []),
        ]);

        const now = Date.now();

        // Fresh website approval items
        const freshWebsite = (websiteList || []).filter((b) => {
          const createdMs = new Date(b.created_at).getTime();
          if (Number.isNaN(createdMs) || createdMs <= alertCutoffMs) return false;
          if (dismissedRef.current.has(b.id)) return false;
          const snoozeExpiry = snoozedUntil[b.id];
          if (snoozeExpiry && now < snoozeExpiry) return false;
          return true;
        });

        // Fresh unassigned bookings (<1h to pickup)
        const freshUrgentUnassigned = (urgentUnassignedList || []).filter((b) => {
          if (dismissedRef.current.has(b.id)) return false;
          const snoozeExpiry = snoozedUntil[b.id];
          if (snoozeExpiry && now < snoozeExpiry) return false;
          return true;
        });

        const combined: BookingAlarmItem[] = [
          ...freshUrgentUnassigned.map((item) => ({
            ...item,
            is_urgent_unassigned: true,
          })),
          ...freshWebsite.map((item) => ({
            ...item,
            is_urgent_unassigned: false,
          })),
        ];

        setQueue(combined);
        if (combined.length > 0) {
          playAlarmSound('booking');
        } else {
          stopAlarmSound('booking');
        }
      } catch (e) {
        stopAlarmSound('booking');
      }
    };

    checkPending();
    timer = setInterval(checkPending, 8000);

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [alertCutoffMs, snoozedUntil, isAuth, pathname]);

  const activeBooking = queue[currentIndex] || queue[0] || null;

  useEffect(() => {
    let interval: any = null;
    let pulseLoop: Animated.CompositeAnimation | null = null;

    if (activeBooking) {
      interval = setInterval(() => setElapsedSecs((prev) => prev + 1), 1000);
      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.15, duration: 400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 400, useNativeDriver: true }),
        ])
      );
      pulseLoop.start();
    } else {
      stopAlarmSound('booking');
      setElapsedSecs(0);
    }

    return () => {
      if (interval) clearInterval(interval);
      if (pulseLoop) pulseLoop.stop();
    };
  }, [activeBooking?.id, pulseAnim]);

  const handleReview = () => {
    if (!activeBooking) return;
    dismissedRef.current.add(activeBooking.id);
    const remaining = queue.filter((b) => b.id !== activeBooking.id);
    setQueue(remaining);
    setCurrentIndex(0);
    if (remaining.length === 0) forceStopAlarmSound();

    if (activeBooking.is_urgent_unassigned) {
      router.push('/emergency-bids' as any);
    } else {
      router.push('/website-booking-approvals' as any);
    }
  };

  const handleSnooze = () => {
    if (!activeBooking) return;
    setSnoozedUntil((prev) => ({ ...prev, [activeBooking.id]: Date.now() + 300000 }));
    const remaining = queue.filter((b) => b.id !== activeBooking.id);
    setQueue(remaining);
    setCurrentIndex(0);
    if (remaining.length === 0) forceStopAlarmSound();
  };

  if (!activeBooking) return null;

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isUnassignedAlert = activeBooking.is_urgent_unassigned;
  const fareVal = activeBooking.quoted_total_amount || activeBooking.total_booking_amount;

  return (
    <Modal visible={!!activeBooking} transparent animationType="fade">
      <View style={styles.overlay}>
        <View
          style={[
            styles.card,
            {
              backgroundColor: isDark ? '#1E293B' : '#FFFFFF',
              borderColor: isUnassignedAlert ? '#EF4444' : '#F59E0B',
            },
          ]}
        >
          <View style={[styles.headerBanner, isUnassignedAlert && { backgroundColor: '#EF4444' }]}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              {isUnassignedAlert ? (
                <AlertTriangle size={32} color="#FFFFFF" />
              ) : (
                <BellRing size={30} color="#FFFFFF" />
              )}
            </Animated.View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>
                {isUnassignedAlert
                  ? '🚨 URGENT: UNASSIGNED BOOKING (<1 HR PICKUP)!'
                  : activeBooking.is_urgent
                    ? '⚡ URGENT BOOKING - NEEDS APPROVAL!'
                    : '🎉 NEW BOOKING AWAITING APPROVAL!'}
              </Text>
              <Text style={styles.headerSubtitle}>
                {isUnassignedAlert
                  ? `⏰ Pickup in ${activeBooking.mins_to_pickup ?? 60} mins · No driver assigned!`
                  : `Queue (${currentIndex + 1} of ${queue.length}) · auto-posts if not reviewed`}
              </Text>
            </View>
            <View style={styles.timerBadge}>
              <Text style={styles.timerText}>{formatTimer(elapsedSecs)}</Text>
            </View>
          </View>

          <View style={styles.contentBox}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={[styles.brandRow, isUnassignedAlert && { backgroundColor: 'rgba(239, 68, 68, 0.15)' }]}>
                {isUnassignedAlert ? (
                  <Clock size={14} color="#EF4444" />
                ) : (
                  <Car size={14} color="#0EA5E9" />
                )}
                <Text style={[styles.brandText, isUnassignedAlert && { color: '#EF4444' }]}>
                  {isUnassignedAlert ? `Order #${activeBooking.id}` : activeBooking.source || 'Website'} · {activeBooking.car_type}
                </Text>
              </View>

              {queue.length > 1 && (
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <TouchableOpacity
                    disabled={currentIndex === 0}
                    onPress={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                    style={[styles.navBtn, currentIndex === 0 && { opacity: 0.4 }]}
                  >
                    <ChevronLeft size={16} color={themeColors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={currentIndex >= queue.length - 1}
                    onPress={() => setCurrentIndex((i) => Math.min(queue.length - 1, i + 1))}
                    style={[styles.navBtn, currentIndex >= queue.length - 1 && { opacity: 0.4 }]}
                  >
                    <ChevronRight size={16} color={themeColors.text} />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <Text style={[styles.customerName, { color: themeColors.text }]}>
              {activeBooking.customer_name || 'Guest'}
            </Text>

            {!!activeBooking.customer_number && (
              <View style={styles.detailRow}>
                <Phone size={14} color={themeColors.textSecondary} />
                <Text style={[styles.detailText, { color: themeColors.textSecondary }]}>{activeBooking.customer_number}</Text>
              </View>
            )}

            <View style={styles.detailRow}>
              <MapPin size={14} color={isUnassignedAlert ? '#EF4444' : '#F59E0B'} />
              <Text style={[styles.detailText, { color: themeColors.text, fontWeight: '700' }]} numberOfLines={2}>
                {locationLabel(activeBooking.pickup_drop_location, activeBooking.route_str)}
              </Text>
            </View>

            <View style={styles.detailRow}>
              <Calendar size={14} color={themeColors.textSecondary} />
              <Text style={[styles.detailText, { color: themeColors.textSecondary }]}>
                {activeBooking.trip_type} · {new Date(activeBooking.start_date_time).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
              </Text>
            </View>

            {!!fareVal && (
              <View style={styles.fareRow}>
                <Text style={[styles.fareLabel, { color: themeColors.textSecondary }]}>Total Fare:</Text>
                <View style={styles.fareBadge}>
                  <IndianRupee size={14} color="#10B981" />
                  <Text style={styles.fareAmount}>{fareVal.toLocaleString('en-IN')}</Text>
                </View>
              </View>
            )}
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[styles.snoozeButton, { backgroundColor: isDark ? '#334155' : '#E2E8F0' }]}
              onPress={handleSnooze}
            >
              <Clock size={18} color={themeColors.text} />
              <Text style={[styles.snoozeText, { color: themeColors.text }]}>SNOOZE (5m)</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.reviewButton, isUnassignedAlert && { backgroundColor: '#EF4444' }]}
              onPress={handleReview}
            >
              <ArrowRight size={20} color="#FFFFFF" />
              <Text style={styles.reviewButtonText}>
                {isUnassignedAlert ? '🚨 HANDLE THIS NOW' : 'REVIEW NOW'}
              </Text>
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
    backgroundColor: 'rgba(15, 23, 42, 0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  card: {
    width: '100%',
    maxWidth: 440,
    borderRadius: 10,
    borderWidth: 3,
    overflow: 'hidden',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  headerBanner: {
    backgroundColor: '#F59E0B',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  headerTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  headerSubtitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FEF3C7',
  },
  timerBadge: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  timerText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  contentBox: {
    padding: 18,
    gap: 10,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(14, 165, 233, 0.12)',
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  brandText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0EA5E9',
  },
  navBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(156, 163, 175, 0.2)',
  },
  customerName: {
    fontSize: 18,
    fontWeight: '800',
    marginTop: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailText: {
    fontSize: 13.5,
    flex: 1,
  },
  fareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(156, 163, 175, 0.2)',
  },
  fareLabel: {
    fontSize: 13,
    fontWeight: '600',
  },
  fareBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 6,
  },
  fareAmount: {
    fontSize: 15,
    fontWeight: '900',
    color: '#10B981',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 18,
    paddingBottom: 18,
  },
  snoozeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    borderRadius: 6,
  },
  snoozeText: {
    fontSize: 13,
    fontWeight: '800',
  },
  reviewButton: {
    flex: 1.5,
    backgroundColor: '#F59E0B',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 6,
  },
  reviewButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
