import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  Animated,
  Platform,
  AppState,
  AppStateStatus,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter, usePathname, useGlobalSearchParams } from 'expo-router';
import { BellRing, CheckCircle2, Phone, MapPin, Calendar, IndianRupee, Globe, Clock, ChevronRight, ChevronLeft, Sparkles } from 'lucide-react-native';
import { enquiriesApi, WebsiteEnquiry } from '@/services/enquiriesApi';
import { apiService } from '@/services/api';
import { playAlarmSound, stopAlarmSound, forceStopAlarmSound, playMildNotificationSound } from '@/utils/alarmSound';
import { alertHealth } from '@/services/alertHealth';
import { registerForPushNotificationsAsync } from '@/services/notificationService';
import { useTheme } from '@/context/ThemeContext';
import { parseIstTimestamp, formatEnquiryReceivedTime, formatPickupDateTime } from '@/utils/performance';

// Legacy keys preserved for backwards compatibility
export const LEAD_ALARM_ENABLED_KEY = 'dropcars_lead_alarm_enabled';
export const LEAD_ALARM_DURATION_KEY = 'dropcars_lead_alarm_duration_sec';
export const LEAD_ALARM_RETRY_KEY = 'dropcars_lead_alarm_retry_sec';

const SERVER_CONFIG_CACHE_KEY = 'dropcars_server_alarm_config_cache_v1';
const DISMISSED_STORAGE_KEY = 'dropcars_admin_enquiry_dismissed_v2';

const DEFAULT_RING_SECONDS = 15;
const DEFAULT_REPEAT_MINUTES = 3;
const FRESH_ALERT_WINDOW_MS = 60 * 60 * 1000; // 60 minutes window for new lead instant alarm

// Event listener mechanism for "Test Alarm" button
type AlarmTestListener = (fakeEnquiry: WebsiteEnquiry) => void;
const testListeners = new Set<AlarmTestListener>();

export function triggerTestEnquiryAlarm(customEnquiry?: Partial<WebsiteEnquiry>) {
  const fake: WebsiteEnquiry = {
    id: 999000 + Math.floor(Math.random() * 999),
    booking_id: 'TEST-LEAD-01',
    name: 'Test Customer (Alert Verification)',
    phone: '+91 98765 43210',
    pickup: 'Chennai Central Railway Station',
    drop_location: 'Coimbatore Airport Terminal',
    trip_type: 'One Way',
    vehicle_type: 'Sedan (Dzire / Etios)',
    class_tier: 'PREMIUM',
    travel_date: new Date().toISOString().split('T')[0],
    travel_time: '18:30',
    fare_estimate: 4250,
    cost_per_km: 13,
    status: 'pending',
    booking_status: 'enquiry',
    website: 'dropcars.in',
    source: 'Website Live Test',
    dispatcher_notes: 'Automated test alarm triggered by Admin/Owner.',
    assigned_dispatcher: null,
    followup_time: null,
    lead_stage: 'New Lead',
    is_touched: false,
    acknowledged_at: null,
    created_at: new Date().toISOString(),
    ...customEnquiry,
  };

  testListeners.forEach((fn) => {
    try {
      fn(fake);
    } catch {}
  });
}

export default function EnquiryAlarmHost() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useGlobalSearchParams<{ segment?: string; tab?: string }>();
  const { isDark, themeColors } = useTheme();

  const [unackQueue, setUnackQueue] = useState<WebsiteEnquiry[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [snoozedUntil, setSnoozedUntil] = useState<Record<number, number>>({});
  const [elapsedSecs, setElapsedSecs] = useState(0);
  const [isAuth, setIsAuth] = useState(false);

  // Track when staff was inside CRM / Leads screen
  const isInsideLeads = pathname === '/enquiries' || (pathname.includes('orders') && (params?.segment === 'crm' || params?.tab === 'leads' || params?.tab === 'crm'));
  const lastLeftLeadsRef = useRef<number | null>(null);

  useEffect(() => {
    if (isInsideLeads) {
      lastLeftLeadsRef.current = null;
    } else {
      if (lastLeftLeadsRef.current === null) {
        lastLeftLeadsRef.current = Date.now();
      }
    }
  }, [isInsideLeads]);

  // Server-driven effective config
  const [enabledNow, setEnabledNow] = useState(true);
  const [ringSeconds, setRingSeconds] = useState(DEFAULT_RING_SECONDS);
  const [repeatMinutes, setRepeatMinutes] = useState(DEFAULT_REPEAT_MINUTES);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const dismissedIdsRef = useRef<Set<number>>(new Set());
  const softNotifiedIdsRef = useRef<Set<number>>(new Set());

  // 1. Initial push token & channel registration on app launch
  useEffect(() => {
    registerForPushNotificationsAsync();
  }, []);

  // 2. Load auth status
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

  // 3. Load & sync server-driven alarm configuration
  const syncAlarmConfig = useCallback(async () => {
    try {
      // First read local cache for instant responsive state
      const cached = await AsyncStorage.getItem(SERVER_CONFIG_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        setEnabledNow(parsed.enabled_now ?? true);
        setRingSeconds(parsed.ring_seconds || DEFAULT_RING_SECONDS);
        setRepeatMinutes(parsed.repeat_minutes || DEFAULT_REPEAT_MINUTES);
      }

      // Check server API for authoritative effective config
      const token = await AsyncStorage.getItem('auth_token');
      if (!token) return;

      const serverConfig = await apiService.getAlarmConfig();
      if (serverConfig) {
        setEnabledNow(serverConfig.enabled_now ?? true);
        if (serverConfig.ring_seconds > 0) setRingSeconds(serverConfig.ring_seconds);
        if (serverConfig.repeat_minutes > 0) setRepeatMinutes(serverConfig.repeat_minutes);

        alertHealth.setEffectiveAlarmStatus(serverConfig);
        await AsyncStorage.setItem(SERVER_CONFIG_CACHE_KEY, JSON.stringify(serverConfig));
      }
    } catch (e) {
      // Fail-open default
      alertHealth.recordPollError('Alarm config fetch fallback: network error');
    }
  }, []);

  useEffect(() => {
    syncAlarmConfig();
    const interval = setInterval(syncAlarmConfig, 5 * 60 * 1000); // sync every 5 min

    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        syncAlarmConfig();
      }
    });

    return () => {
      clearInterval(interval);
      subscription.remove();
    };
  }, [syncAlarmConfig]);

  // 4. Test Alarm listener registration
  useEffect(() => {
    const onTest = (fakeLead: WebsiteEnquiry) => {
      setUnackQueue((prev) => [fakeLead, ...prev.filter((e) => e.id !== fakeLead.id)]);
      setCurrentIndex(0);
      playAlarmSound('enquiry');
    };

    testListeners.add(onTest);
    return () => {
      testListeners.delete(onTest);
    };
  }, []);

  // 5. Load dismissed leads cache
  useEffect(() => {
    (async () => {
      try {
        const stored = await AsyncStorage.getItem(DISMISSED_STORAGE_KEY);
        if (stored) dismissedIdsRef.current = new Set(JSON.parse(stored));
      } catch {}
    })();
  }, []);

  const persistDismissed = async () => {
    try {
      await AsyncStorage.setItem(DISMISSED_STORAGE_KEY, JSON.stringify(Array.from(dismissedIdsRef.current)));
    } catch {}
  };

  // 6. Polling loop for active unacknowledged enquiries (every 10s)
  useEffect(() => {
    if (!isAuth || pathname === '/login' || !enabledNow) {
      stopAlarmSound('enquiry');
      setUnackQueue([]);
      return;
    }

    let isMounted = true;
    let timer: any = null;

    const checkNewEnquiries = async () => {
      try {
        const res = await enquiriesApi.fetchUnacknowledgedResult();
        if (!res.success || !isMounted) {
          return;
        }

        const unackList = res.enquiries;
        const liveIds = new Set(unackList.map((e) => e.id));

        // Clean up resolved leads from dismissed set
        let dismissedChanged = false;
        for (const id of dismissedIdsRef.current) {
          if (!liveIds.has(id)) {
            dismissedIdsRef.current.delete(id);
            dismissedChanged = true;
          }
        }
        if (dismissedChanged) persistDismissed();

        for (const id of softNotifiedIdsRef.current) {
          if (!liveIds.has(id)) softNotifiedIdsRef.current.delete(id);
        }

        const now = Date.now();

        // Filter: ONLY fresh enquiries (< 60 mins), expired snooze reminders, or test items
        const activeItems = unackList.filter((e) => {
          // 1. Check if snoozed
          const resumeAt = snoozedUntil[e.id];
          if (resumeAt) {
            if (now < resumeAt) return false;
            // Snooze expired -> Snooze reminder alarm!
            return true;
          }

          // 2. Check if dismissed locally
          if (dismissedIdsRef.current.has(e.id)) return false;

          // 3. Test leads always trigger
          if (e.id >= 999000) return true;

          // 4. Fresh Lead Check: Only leads received within the last 60 minutes trigger loud alarms
          const createdMs = parseIstTimestamp(e.created_at);
          if (createdMs > 0) {
            const ageMs = now - createdMs;
            // Old backlog leads (> 60 mins ago) do NOT trigger siren alarm
            if (ageMs > FRESH_ALERT_WINDOW_MS || ageMs < -5 * 60 * 1000) {
              return false;
            }
          }

          return true;
        });

        if (!isMounted) return;

        // 10-Minute CRM Screen Proximity Rule
        const awayFromLeadsMs = lastLeftLeadsRef.current !== null ? (now - lastLeftLeadsRef.current) : 0;
        const isRecentlyInLeads = isInsideLeads || (lastLeftLeadsRef.current !== null && awayFromLeadsMs < 10 * 60 * 1000);

        if (activeItems.length > 0) {
          if (isRecentlyInLeads) {
            // Staff was in leads screen < 10 mins ago -> Play 2-second mild chime instead of full siren
            const freshOnes = activeItems.filter((e) => !softNotifiedIdsRef.current.has(e.id));
            if (freshOnes.length > 0) {
              playMildNotificationSound();
              freshOnes.forEach((e) => softNotifiedIdsRef.current.add(e.id));
            }
            if (isInsideLeads) {
              setUnackQueue([]);
              stopAlarmSound('enquiry');
              return;
            }
          } else {
            // Staff has been away from leads screen >= 10 mins -> Full Siren Alarm!
            playAlarmSound('enquiry');
          }
        } else {
          stopAlarmSound('enquiry');
        }

        setUnackQueue(activeItems);
      } catch {
        stopAlarmSound('enquiry');
      }
    };

    checkNewEnquiries();
    timer = setInterval(checkNewEnquiries, 10000);

    return () => {
      isMounted = false;
      if (timer) clearInterval(timer);
    };
  }, [snoozedUntil, isAuth, pathname, enabledNow, isInsideLeads]);

  const activeEnquiry = unackQueue[currentIndex] || unackQueue[0] || null;

  const snoozeEnquiry = (id: number, resumeInMs: number) => {
    setSnoozedUntil((prev) => ({ ...prev, [id]: Date.now() + resumeInMs }));
    setUnackQueue((prev) => {
      const remaining = prev.filter((e) => e.id !== id);
      if (remaining.length === 0) forceStopAlarmSound();
      return remaining;
    });
    setCurrentIndex(0);
  };

  // Ring duration & auto-snooze cycle
  useEffect(() => {
    let interval: any = null;
    let pulseLoop: Animated.CompositeAnimation | null = null;
    let autoTimeout: any = null;

    if (activeEnquiry) {
      const id = activeEnquiry.id;
      setElapsedSecs(0);

      interval = setInterval(() => {
        setElapsedSecs((prev) => prev + 1);
      }, 1000);

      pulseLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.1, duration: 400, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 400, useNativeDriver: true }),
        ])
      );
      pulseLoop.start();

      // Auto-snooze after ringSeconds -> retries after repeatMinutes
      const autoSnoozeDurationMs = Math.max(1, repeatMinutes) * 60 * 1000;
      autoTimeout = setTimeout(() => {
        snoozeEnquiry(id, autoSnoozeDurationMs);
      }, ringSeconds * 1000);
    } else {
      stopAlarmSound('enquiry');
    }

    return () => {
      if (interval) clearInterval(interval);
      if (pulseLoop) pulseLoop.stop();
      if (autoTimeout) clearTimeout(autoTimeout);
    };
  }, [activeEnquiry?.id, ringSeconds, repeatMinutes, pulseAnim]);

  const handleRespond = () => {
    if (!activeEnquiry) return;

    unackQueue.forEach((e) => {
      dismissedIdsRef.current.add(e.id);
    });
    persistDismissed();

    setUnackQueue([]);
    setCurrentIndex(0);
    forceStopAlarmSound();

    router.push({ pathname: '/(tabs)/orders', params: { segment: 'crm' } } as any);
  };

  if (!activeEnquiry) return null;

  const formatTimer = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const isTestItem = activeEnquiry.id >= 999000;
  const isSnoozeReminder = !!snoozedUntil[activeEnquiry.id];

  return (
    <Modal visible={!!activeEnquiry} transparent animationType="fade" statusBarTranslucent>
      <View style={styles.overlay}>
        <View style={[styles.card, { backgroundColor: isDark ? '#0F172A' : '#FFFFFF', borderColor: '#EF4444' }]}>
          {/* Header Banner */}
          <View style={styles.headerBanner}>
            <Animated.View style={{ transform: [{ scale: pulseAnim }] }}>
              <BellRing size={26} color="#FFFFFF" />
            </Animated.View>
            <View style={{ flex: 1 }}>
              <Text style={styles.headerTitle}>
                {isSnoozeReminder ? '🔔 SNOOZED ENQUIRY REMINDER!' : '🚨 INCOMING INQUIRY ALERT!'}
              </Text>
              <Text style={styles.headerSubtitle}>
                {isTestItem ? '🔔 Test Alarm Mode' : `Queue (${currentIndex + 1} of ${unackQueue.length})`}
              </Text>
            </View>
            <View style={styles.timerBadge}>
              <Text style={styles.timerText}>{formatTimer(elapsedSecs)}</Text>
            </View>
          </View>

          {/* Details Box */}
          <View style={styles.contentBox}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
              <View style={styles.brandRow}>
                <Globe size={13} color="#0EA5E9" />
                <Text style={styles.brandText}>
                  {activeEnquiry.website || activeEnquiry.source || 'Drop Cars (dropcars.in)'}
                </Text>
              </View>

              {unackQueue.length > 1 && (
                <View style={{ flexDirection: 'row', gap: 4 }}>
                  <TouchableOpacity
                    disabled={currentIndex === 0}
                    onPress={() => setCurrentIndex((i) => Math.max(0, i - 1))}
                    style={[styles.navBtn, currentIndex === 0 && { opacity: 0.4 }]}
                  >
                    <ChevronLeft size={16} color={themeColors.text} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    disabled={currentIndex >= unackQueue.length - 1}
                    onPress={() => setCurrentIndex((i) => Math.min(unackQueue.length - 1, i + 1))}
                    style={[styles.navBtn, currentIndex >= unackQueue.length - 1 && { opacity: 0.4 }]}
                  >
                    <ChevronRight size={16} color={themeColors.text} />
                  </TouchableOpacity>
                </View>
              )}
            </View>

            <Text style={[styles.customerName, { color: themeColors.text }]}>
              {activeEnquiry.name || 'Customer Lead'}
            </Text>

            {/* Prominent Enquiry Received Line */}
            <View style={styles.detailRow}>
              <Clock size={14} color="#F59E0B" />
              <Text style={[styles.detailText, { color: themeColors.text, fontWeight: '700' }]}>
                Enquiry received:{' '}
                <Text style={{ fontWeight: '500', color: themeColors.textSecondary }}>
                  {formatEnquiryReceivedTime(activeEnquiry.created_at)}
                </Text>
              </Text>
            </View>

            {/* Prominent Pickup Date & Time Row */}
            <View
              style={[
                styles.detailRow,
                styles.pickupRow,
                {
                  backgroundColor: isDark ? 'rgba(14, 165, 233, 0.1)' : '#F0F9FF',
                  borderColor: isDark ? '#0284C7' : '#BAE6FD',
                },
              ]}
            >
              <Calendar size={14} color="#0284C7" />
              <Text style={[styles.detailText, { color: isDark ? '#38BDF8' : '#0369A1', fontWeight: '800' }]}>
                Pickup: {formatPickupDateTime(activeEnquiry.travel_date, activeEnquiry.travel_time)}
              </Text>
            </View>

            {!!activeEnquiry.phone && (
              <View style={styles.detailRow}>
                <Phone size={14} color={themeColors.textSecondary} />
                <Text style={[styles.detailText, { color: themeColors.textSecondary }]}>{activeEnquiry.phone}</Text>
              </View>
            )}

            <View style={styles.detailRow}>
              <MapPin size={14} color="#EF4444" />
              <Text style={[styles.detailText, { color: themeColors.text, fontWeight: '700' }]} numberOfLines={2}>
                {activeEnquiry.pickup || 'Pickup'} → {activeEnquiry.drop_location || 'Drop'}
              </Text>
            </View>

            {!!activeEnquiry.fare_estimate && (
              <View style={styles.fareRow}>
                <Text style={[styles.fareLabel, { color: themeColors.textSecondary }]}>Quoted Fare:</Text>
                <View style={styles.fareBadge}>
                  <IndianRupee size={13} color="#10B981" />
                  <Text style={styles.fareAmount}>{activeEnquiry.fare_estimate.toLocaleString('en-IN')}</Text>
                </View>
              </View>
            )}
          </View>

          {/* Action Buttons Row with 5m / 10m / 20m Snooze Chips */}
          <View style={{ paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: themeColors.textSecondary }}>
                SNOOZE:
              </Text>
              <TouchableOpacity
                style={[styles.snoozeChip, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: themeColors.border }]}
                onPress={() => snoozeEnquiry(activeEnquiry.id, 5 * 60 * 1000)}
                activeOpacity={0.7}
              >
                <Clock size={12} color={themeColors.text} />
                <Text style={[styles.snoozeChipText, { color: themeColors.text }]}>5m</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.snoozeChip, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: themeColors.border }]}
                onPress={() => snoozeEnquiry(activeEnquiry.id, 10 * 60 * 1000)}
                activeOpacity={0.7}
              >
                <Clock size={12} color={themeColors.text} />
                <Text style={[styles.snoozeChipText, { color: themeColors.text }]}>10m</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.snoozeChip, { backgroundColor: isDark ? '#1E293B' : '#F1F5F9', borderColor: themeColors.border }]}
                onPress={() => snoozeEnquiry(activeEnquiry.id, 20 * 60 * 1000)}
                activeOpacity={0.7}
              >
                <Clock size={12} color={themeColors.text} />
                <Text style={[styles.snoozeChipText, { color: themeColors.text }]}>20m</Text>
              </TouchableOpacity>
            </View>

            <TouchableOpacity style={styles.ackButton} onPress={handleRespond} activeOpacity={0.85}>
              <CheckCircle2 size={18} color="#FFFFFF" />
              <Text style={styles.ackButtonText}>RESPOND NOW (CALL / WHATSAPP)</Text>
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
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  card: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 10,
    borderWidth: 2,
    overflow: 'hidden',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.35,
    shadowRadius: 16,
    elevation: 12,
  },
  headerBanner: {
    backgroundColor: '#EF4444',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  headerTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FEE2E2',
  },
  timerBadge: {
    backgroundColor: 'rgba(0,0,0,0.3)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  timerText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  contentBox: {
    padding: 16,
    gap: 8,
  },
  brandRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(14, 165, 233, 0.12)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  brandText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0EA5E9',
  },
  navBtn: {
    padding: 4,
    borderRadius: 6,
    backgroundColor: 'rgba(156, 163, 175, 0.2)',
  },
  customerName: {
    fontSize: 16,
    fontWeight: '800',
    marginTop: 2,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  pickupRow: {
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 6,
    borderWidth: 1,
    marginVertical: 2,
  },
  detailText: {
    fontSize: 13,
    flex: 1,
  },
  fareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 2,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(156, 163, 175, 0.2)',
  },
  fareLabel: {
    fontSize: 12,
    fontWeight: '600',
  },
  fareBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: 'rgba(16, 185, 129, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  fareAmount: {
    fontSize: 14,
    fontWeight: '900',
    color: '#10B981',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  snoozeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 12,
    borderRadius: 6,
  },
  snoozeText: {
    fontSize: 12,
    fontWeight: '800',
  },
  snoozeChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  snoozeChipText: {
    fontSize: 12,
    fontWeight: '800',
  },
  ackButton: {
    width: '100%',
    backgroundColor: '#10B981',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    borderRadius: 8,
  },
  ackButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 0.5,
  },
});
