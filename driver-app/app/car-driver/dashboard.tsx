import FreshRefreshControl from '@/components/FreshRefreshControl';
import React, { useState, useEffect, useRef } from 'react';
import { safeBack } from '@/utils/safeBack';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  RefreshControl,
  Linking,
  Animated,
  Easing,
} from 'react-native';
import Modal from '@/components/KeyboardSafe';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCarDriver } from '@/contexts/CarDriverContext';
import { getDriverAssignedOrders } from '@/services/driver/carDriverService';
import ProfilePhotoReminder from '@/components/ProfilePhotoReminder';
import OverlayPermissionPrompt from '@/components/OverlayPermissionPrompt';
import CustomerNumberCountdown from '@/components/CustomerNumberCountdown';
import {
  User,
  Phone,
  Wifi,
  WifiOff,
  AlertCircle,
  ArrowLeft,
  Briefcase,
  Play,
  ChevronRight,
  Power,
  Lock,
  Radio,
  MapPin,
  Navigation,
  Compass,
  Sparkles,
  Star,
  CheckCircle,
  Zap,
} from 'lucide-react-native';
function LiveRadarSearching({
  isOnline,
  driverLocation,
  colors,
  isDarkMode,
  onGoOnline,
  statusLoading,
}: {
  isOnline: boolean;
  driverLocation: string;
  colors: any;
  isDarkMode: boolean;
  onGoOnline: () => void;
  statusLoading: boolean;
}) {
  const pulse1 = useRef(new Animated.Value(0)).current;
  const pulse2 = useRef(new Animated.Value(0)).current;
  const pulse3 = useRef(new Animated.Value(0)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!isOnline) return;

    const createPulse = (val: Animated.Value, delay: number) => {
      return Animated.loop(
        Animated.sequence([
          Animated.delay(delay),
          Animated.timing(val, {
            toValue: 1,
            duration: 2600,
            easing: Easing.out(Easing.ease),
            useNativeDriver: true,
          }),
          Animated.timing(val, {
            toValue: 0,
            duration: 0,
            useNativeDriver: true,
          }),
        ])
      );
    };

    const rotate = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 4000,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );

    const p1 = createPulse(pulse1, 0);
    const p2 = createPulse(pulse2, 850);
    const p3 = createPulse(pulse3, 1700);

    p1.start();
    p2.start();
    p3.start();
    rotate.start();

    return () => {
      p1.stop();
      p2.stop();
      p3.stop();
      rotate.stop();
    };
  }, [isOnline]);

  if (!isOnline) {
    return (
      <View style={{
        backgroundColor: colors.surface,
        borderRadius: 10,
        padding: 24,
        alignItems: 'center',
        marginBottom: 18,
        borderWidth: 1,
        borderColor: colors.border,
      }}>
        <View style={{
          width: 72,
          height: 72,
          borderRadius: 36,
          backgroundColor: isDarkMode ? '#1F2937' : '#FEE2E2',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 16,
        }}>
          <Power color="#EF4444" size={32} />
        </View>

        <View style={{ backgroundColor: isDarkMode ? '#374151' : '#F3F4F6', paddingHorizontal: 12, paddingVertical: 4, borderRadius: 6, marginBottom: 10 }}>
          <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', color: colors.textSecondary }}>
            🔴 DUTY MODE IS OFFLINE
          </Text>
        </View>

        <Text style={{ fontSize: 18, fontFamily: 'Inter-Bold', color: colors.text, textAlign: 'center', marginBottom: 8 }}>
          Go On Duty for Live Bookings
        </Text>
        <Text style={{ fontSize: 13, fontFamily: 'Inter-Medium', color: colors.textSecondary, textAlign: 'center', lineHeight: 19, marginBottom: 20, maxWidth: 300 }}>
          Turn on duty to activate live radar scanning and receive instant local customer rides in your area.
        </Text>

        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: '#10B981',
            paddingVertical: 14,
            paddingHorizontal: 28,
            borderRadius: 14,
            shadowColor: '#10B981',
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.3,
            shadowRadius: 8,
            elevation: 4,
          }}
          onPress={onGoOnline}
          disabled={statusLoading}
          activeOpacity={0.85}
        >
          {statusLoading ? (
            <ActivityIndicator color="#FFFFFF" size="small" />
          ) : (
            <>
              <Zap color="#FFFFFF" size={18} />
              <Text style={{ color: '#FFFFFF', fontSize: 15, fontFamily: 'Inter-Bold' }}>
                Turn On Duty Now
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  // Interpolations for Radar
  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  const getRingStyle = (anim: Animated.Value) => {
    return {
      transform: [{
        scale: anim.interpolate({
          inputRange: [0, 1],
          outputRange: [0.6, 2.2],
        }),
      }],
      opacity: anim.interpolate({
        inputRange: [0, 0.2, 0.8, 1],
        outputRange: [0.7, 0.5, 0.2, 0],
      }),
    };
  };

  return (
    <View style={{
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 20,
      alignItems: 'center',
      marginBottom: 18,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    }}>
      {/* Top Status Pill */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: isDarkMode ? '#064E3B' : '#ECFDF5',
        borderWidth: 1,
        borderColor: isDarkMode ? '#059669' : '#6EE7B7',
        paddingHorizontal: 12,
        paddingVertical: 5,
        borderRadius: 10,
        marginBottom: 20,
      }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
        <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', color: '#059669', letterSpacing: 0.3 }}>
          LIVE RADAR SEARCHING
        </Text>
      </View>

      {/* Futuristic Animated Radar View */}
      <View style={{
        width: 220,
        height: 220,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
      }}>
        {/* Pulse Waves */}
        <Animated.View style={[{
          position: 'absolute',
          width: 100,
          height: 100,
          borderRadius: 50,
          borderWidth: 2,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.15)',
        }, getRingStyle(pulse1)]} />

        <Animated.View style={[{
          position: 'absolute',
          width: 100,
          height: 100,
          borderRadius: 50,
          borderWidth: 2,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.10)',
        }, getRingStyle(pulse2)]} />

        <Animated.View style={[{
          position: 'absolute',
          width: 100,
          height: 100,
          borderRadius: 50,
          borderWidth: 2,
          borderColor: '#10B981',
          backgroundColor: 'rgba(16, 185, 129, 0.05)',
        }, getRingStyle(pulse3)]} />

        {/* Rotating Scanner Line / Sweep */}
        <Animated.View style={{
          position: 'absolute',
          width: 190,
          height: 190,
          borderRadius: 95,
          borderWidth: 1,
          borderColor: isDarkMode ? '#05966940' : '#A7F3D0',
          borderStyle: 'dashed',
          transform: [{ rotate: spin }],
          alignItems: 'center',
          justifyContent: 'flex-start',
        }}>
          <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: '#10B981', marginTop: 4 }} />
        </Animated.View>

        {/* Outer Circular Bounds */}
        <View style={{
          position: 'absolute',
          width: 150,
          height: 150,
          borderRadius: 75,
          borderWidth: 1,
          borderColor: isDarkMode ? '#05966930' : '#D1FAE5',
        }} />

        {/* Center Glowing Hub */}
        <View style={{
          width: 60,
          height: 60,
          borderRadius: 30,
          backgroundColor: '#10B981',
          alignItems: 'center',
          justifyContent: 'center',
          shadowColor: '#10B981',
          shadowOffset: { width: 0, height: 0 },
          shadowOpacity: 0.6,
          shadowRadius: 14,
          elevation: 8,
        }}>
          <Navigation color="#FFFFFF" size={26} />
        </View>
      </View>

      {/* Status Heading & Details */}
      <Text style={{ fontSize: 17, fontFamily: 'Inter-Bold', color: colors.text, textAlign: 'center', marginBottom: 6 }}>
        Searching for Local Bookings...
      </Text>
      <Text style={{ fontSize: 12.5, fontFamily: 'Inter-Medium', color: colors.textSecondary, textAlign: 'center', lineHeight: 18, marginBottom: 18, maxWidth: 320 }}>
        Scanning customer pickup points near your live location. When a local ride matches, an alert will sound with instant 1-tap accept.
      </Text>

      {/* Real-time Status Chips */}
      <View style={{
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'center',
        gap: 8,
        marginBottom: 16,
      }}>
        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          backgroundColor: isDarkMode ? '#1E293B' : '#F1F5F9',
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: isDarkMode ? '#334155' : '#E2E8F0',
        }}>
          <MapPin color={colors.primary} size={13} />
          <Text style={{ flexShrink: 1, fontSize: 11.5, fontFamily: 'Inter-SemiBold', color: colors.text }}>
            {driverLocation}
          </Text>
        </View>

        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          backgroundColor: isDarkMode ? '#1E293B' : '#F1F5F9',
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: isDarkMode ? '#334155' : '#E2E8F0',
        }}>
          <Radio color="#10B981" size={13} />
          <Text style={{ fontSize: 11.5, fontFamily: 'Inter-SemiBold', color: colors.text }}>
            Radar Radius: 15 KM
          </Text>
        </View>

        <View style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          backgroundColor: isDarkMode ? '#1E293B' : '#F1F5F9',
          paddingHorizontal: 10,
          paddingVertical: 6,
          borderRadius: 6,
          borderWidth: 1,
          borderColor: isDarkMode ? '#334155' : '#E2E8F0',
        }}>
          <Sparkles color="#F59E0B" size={13} />
          <Text style={{ fontSize: 11.5, fontFamily: 'Inter-SemiBold', color: colors.text }}>
            Local Dispatch: Active
          </Text>
        </View>
      </View>

      {/* Info Notice Box */}
      <View style={{
        backgroundColor: isDarkMode ? '#111827' : '#EFF6FF',
        borderRadius: 6,
        padding: 12,
        borderWidth: 1,
        borderColor: isDarkMode ? '#1F2937' : '#BFDBFE',
        flexDirection: 'row',
        alignItems: 'flex-start',
        gap: 8,
        width: '100%',
      }}>
        <Compass color="#2563EB" size={16} style={{ marginTop: 2 }} />
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: '#1D4ED8', marginBottom: 2 }}>
            Instant Local Dispatch Mode
          </Text>
          <Text style={{ fontSize: 11, fontFamily: 'Inter-Medium', color: colors.textSecondary, lineHeight: 15 }}>
            Outstation & drop bookings are managed in Open Bookings. This Live Radar is dedicated to high-frequency point-to-point local bookings.
          </Text>
        </View>
      </View>
    </View>
  );
}

export default function CarDriverDashboardScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const { colors, isDarkMode } = useTheme();
  const { t } = useLanguage();
  const {
    driver,
    isAuthenticated,
    isLoading,
    error,
    goOnline,
    goOffline,
    refreshDriverData,
    clearError,
    signinAsOwner,
  } = useCarDriver();
  const router = useRouter();

  const [refreshing, setRefreshing] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);
  const [dutyBookings, setDutyBookings] = useState<any[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [bookingFilter, setBookingFilter] = useState<'live' | 'upcoming' | 'completed'>('live');
  const [statusDrawerVisible, setStatusDrawerVisible] = useState(false);
  const [isFabExpanded, setIsFabExpanded] = useState(false);

  useEffect(() => {
    clearError();
    const timer = setTimeout(() => {
      setBookingsLoading(false);
    }, 2000);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (driver?.id) {
      fetchBookings();
    } else {
      setBookingsLoading(false);
    }
  }, [driver?.id]);

  const fetchBookings = async () => {
    try {
      setBookingsLoading(true);
      if (driver?.id) {
        // Was calling getDriverAssignmentsWithDetails(driverId), which hits
        // GET /api/assignments/driver/{driverId} - a route that doesn't
        // exist on the backend (only /driver/assigned-orders does, keyed
        // off the authenticated driver's own token, no id needed). That
        // call always 404'd silently, so this list was permanently empty.
        // getDriverAssignedOrders() is the same endpoint quick-dashboard
        // and my-bookings already use correctly, including the real
        // phone_reveal_hours_before_pickup masking on customer_number.
        const res = await getDriverAssignedOrders();
        const mapped = (res || []).map((a: any) => ({
          id: a.id,
          booking_id: a.order_id,
          status: a.assignment_status,
          from_city: a.pickup_drop_location?.location_1 || a.pickup_drop_location?.['0'] || a.pickup_location || 'Pickup Location',
          to_city: a.pickup_drop_location?.location_2 || a.pickup_drop_location?.['1'] || a.drop_location || 'Drop Location',
          customer_name: a.customer_name,
          customer_phone: a.customer_number,
          fare: a.estimated_price || a.total_booking_amount || 0,
          raw: a,
        }));
        setDutyBookings(mapped);
      }
    } catch (err) {
      console.log('ℹ️ Duty bookings fetch:', err);
    } finally {
      setBookingsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await refreshDriverData();
      await fetchBookings();
    } catch (error: any) {
      console.error('Refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  };

  const [isOnlineState, setIsOnlineState] = useState<boolean>(() => {
    if (!driver) return true;
    const st = ((driver as any).driver_status || (driver as any).status || '').toUpperCase();
    return st === 'ONLINE' || st === 'DRIVING';
  });

  useEffect(() => {
    if (driver) {
      const st = ((driver as any).driver_status || (driver as any).status || '').toUpperCase();
      if (st === 'OFFLINE') {
        setIsOnlineState(false);
      } else if (st === 'ONLINE' || st === 'DRIVING') {
        setIsOnlineState(true);
      }
    }
  }, [driver?.driver_status, driver?.status]);

  const handleStatusToggle = async () => {
    try {
      setStatusLoading(true);
      clearError();

      if (isOnlineState) {
        // Restriction check: Cannot go off duty within 1 hour before scheduled trip start or while a trip is active
        const now = new Date();
        const oneHourLater = new Date(now.getTime() + 60 * 60 * 1000);

        const hasActiveOrUpcomingTrip = dutyBookings.some((b) => {
          const status = (b.status || b.booking_status || b.trip_status || '').toLowerCase();
          const isActive = status.includes('assigned') || status.includes('started') || status.includes('ongoing') || status.includes('live') || status.includes('running');
          if (isActive) return true;

          const rawTime = b.start_date_time || b.start_time || b.pickup_time;
          if (rawTime) {
            const tripTime = new Date(rawTime);
            if (!isNaN(tripTime.getTime())) {
              return tripTime >= now && tripTime <= oneHourLater;
            }
          }
          return false;
        });

        if (hasActiveOrUpcomingTrip) {
          Alert.alert(
            'Cannot Go Off Duty',
            'You have an assigned trip active or scheduled within 1 hour. You must remain On Duty until the trip is completed.'
          );
          return;
        }

        setIsOnlineState(false);
        await goOffline();
      } else {
        setIsOnlineState(true);
        await goOnline();
      }
    } catch (error: any) {
      setIsOnlineState(!isOnlineState);
      Alert.alert('Status Update', error.message || 'Could not change duty status. Please try again.');
    } finally {
      setStatusLoading(false);
    }
  };

  const isOnline = isOnlineState;

  const fabCollapseTimerRef = useRef<any>(null);

  const expandFabTemporarily = () => {
    setIsFabExpanded(true);
    if (fabCollapseTimerRef.current) {
      clearTimeout(fabCollapseTimerRef.current);
    }
    fabCollapseTimerRef.current = setTimeout(() => {
      setIsFabExpanded(false);
    }, 2800);
  };

  useEffect(() => {
    if (isOnline && bookingFilter === 'live') {
      expandFabTemporarily();
    } else {
      setIsFabExpanded(false);
      if (fabCollapseTimerRef.current) clearTimeout(fabCollapseTimerRef.current);
    }
  }, [isOnline, bookingFilter]);

  useEffect(() => {
    return () => {
      if (fabCollapseTimerRef.current) clearTimeout(fabCollapseTimerRef.current);
    };
  }, []);

  const activeCount = dutyBookings.filter((b) => {
    const status = (b.status || b.booking_status || '').toLowerCase();
    return status.includes('assigned') || status.includes('started') || status.includes('ongoing') || status.includes('live');
  }).length;

  const completedCount = dutyBookings.filter((b) => {
    const status = (b.status || b.booking_status || '').toLowerCase();
    return status.includes('completed') || status.includes('done');
  }).length;

  const filteredBookings = dutyBookings.filter((b) => {
    const status = (b.status || b.booking_status || '').toLowerCase();
    if (bookingFilter === 'upcoming') return status.includes('assigned') || status.includes('started') || status.includes('ongoing') || status.includes('live');
    if (bookingFilter === 'completed') return status.includes('completed') || status.includes('done');
    return true;
  });

  const driverName = driver?.full_name || (driver as any)?.name || 'Driver';
  const driverLocation = (driver as any)?.city ? `${(driver as any).city}, TN` : (driver?.address || 'Location not set');

  const dynamicStyles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 10,
      paddingVertical: 10,
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    headerLeft: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    backButton: {
      padding: 8,
      marginRight: 10,
      borderRadius: 6,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerTitle: {
      fontSize: 19,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      letterSpacing: -0.3,
    },
    headerRightGroup: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    headerBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 5,
      borderRadius: 10,
      backgroundColor: isOnline ? '#10B9811F' : '#6B72801A',
      borderWidth: 1,
      borderColor: isOnline ? '#10B98150' : '#6B728030',
    },
    headerBadgeDot: {
      width: 7,
      height: 7,
      borderRadius: 3.5,
      backgroundColor: isOnline ? '#10B981' : '#6B7280',
      marginRight: 5,
    },
    headerBadgeText: {
      fontSize: 11.5,
      fontFamily: 'Inter-Bold',
      color: isOnline ? '#059669' : '#4B5563',
      letterSpacing: 0.4,
    },
    profileTriggerBtn: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.surface,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 3,
    },
    profileTriggerAvatarText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontFamily: 'Inter-Bold',
    },
    content: {
      flex: 1,
      paddingHorizontal: 10,
      paddingTop: 8,
    },
    dutyActionStrip: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.surface,
      borderRadius: 16,
      paddingHorizontal: 14,
      paddingVertical: 12,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isOnline ? '#10B98140' : colors.border,
      shadowColor: isOnline ? '#10B981' : '#000000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: isOnline ? 0.1 : 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
    dutyStripLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 10,
    },
    dutyPulseDotContainer: {
      width: 24,
      height: 24,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    dutyPulseDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dutyPulseRing: {
      position: 'absolute',
      width: 20,
      height: 20,
      borderRadius: 10,
    },
    dutyStripTitle: {
      fontSize: 13.5,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      letterSpacing: -0.2,
    },
    dutyStripSub: {
      fontSize: 11.5,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
      marginTop: 1,
    },
    dutyToggleBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 12,
      gap: 6,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 4,
      elevation: 3,
    },
    dutyToggleBtnText: {
      color: '#FFFFFF',
      fontSize: 12.5,
      fontFamily: 'Inter-Bold',
      letterSpacing: 0.2,
    },
    pinnedTabBar: {
      flexDirection: 'row',
      width: '100%',
      backgroundColor: colors.surface,
      borderBottomWidth: 1,
      borderBottomColor: isDarkMode ? 'rgba(255,255,255,0.08)' : '#E2E8F0',
      paddingHorizontal: 0,
      margin: 0,
    },
    edgeTab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      borderBottomWidth: 2.5,
      borderBottomColor: 'transparent',
      borderRadius: 0,
    },
    edgeTabActive: {
      borderBottomColor: colors.primary,
      backgroundColor: isDarkMode ? 'rgba(255,255,255,0.02)' : 'rgba(0,0,0,0.015)',
    },
    edgeTabText: {
      fontSize: 13,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
    },
    edgeTabTextActive: {
      fontFamily: 'Inter-Bold',
      color: colors.primary,
    },
    sectionHeaderContainer: {
      marginBottom: 8,
      marginTop: 2,
    },
    sectionTitle: {
      fontSize: 18,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      marginBottom: 10,
    },
    filterTabs: {
      flexDirection: 'row',
      backgroundColor: colors.background,
      borderRadius: 6,
      padding: 3,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterTab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 6,
    },
    filterTabActive: {
      backgroundColor: colors.surface,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    filterTabText: {
      fontSize: 12.5,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
    },
    filterTabTextActive: {
      color: colors.primary,
      fontFamily: 'Inter-Bold',
    },
    emptyCard: {
      backgroundColor: colors.surface,
      borderRadius: 10,
      padding: 24,
      alignItems: 'center',
      marginBottom: 18,
      borderWidth: 1,
      borderColor: colors.border,
    },
    emptyIconBg: {
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: colors.primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    emptyTitle: {
      fontSize: 16,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      marginBottom: 6,
      textAlign: 'center',
    },
    emptySub: {
      fontSize: 13,
      fontFamily: 'Inter-Regular',
      color: colors.textSecondary,
      textAlign: 'center',
      lineHeight: 19,
      marginBottom: 16,
    },
    emptyBtn: {
      backgroundColor: colors.primary + '15',
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 6,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.primary + '30',
    },
    emptyBtnText: {
      fontSize: 13,
      fontFamily: 'Inter-Bold',
      color: colors.primary,
      marginRight: 6,
    },
    bookingCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.03,
      shadowRadius: 4,
      elevation: 2,
    },
    bookingHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    bookingId: {
      fontSize: 14,
      fontFamily: 'Inter-Bold',
      color: colors.primary,
    },
    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 6,
      backgroundColor: '#10B9811F',
    },
    statusBadgeText: {
      fontSize: 11.5,
      fontFamily: 'Inter-Bold',
      color: '#10B981',
    },
    routeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
    },
    routeDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.primary,
      marginRight: 10,
    },
    routeDotDrop: {
      backgroundColor: '#EF4444',
    },
    routeText: {
      fontSize: 13.5,
      fontFamily: 'Inter-Medium',
      color: colors.text,
      flex: 1,
    },
    bookingFooter: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: 12,
      paddingTop: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
    },
    fareText: {
      fontSize: 17,
      fontFamily: 'Inter-Bold',
      color: colors.text,
    },
    startTripBtn: {
      backgroundColor: colors.primary,
      paddingHorizontal: 16,
      paddingVertical: 9,
      borderRadius: 6,
      flexDirection: 'row',
      alignItems: 'center',
    },
    startTripBtnText: {
      color: '#FFFFFF',
      fontSize: 13.5,
      fontFamily: 'Inter-Bold',
      marginLeft: 6,
    },
    statsCard: {
      backgroundColor: colors.surface,
      borderRadius: 20,
      padding: 18,
      marginBottom: 24,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.04,
      shadowRadius: 6,
      elevation: 2,
    },
    statsTitle: {
      fontSize: 16,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      marginBottom: 14,
    },
    statsGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
    },
    statItem: {
      flex: 1,
      minWidth: '47%',
      backgroundColor: colors.background,
      paddingVertical: 14,
      paddingHorizontal: 14,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    statIconBg: {
      width: 34,
      height: 34,
      borderRadius: 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    statValue: {
      fontSize: 20,
      fontFamily: 'Inter-Bold',
      color: colors.text,
    },
    statLabel: {
      fontSize: 12,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
      marginTop: 2,
    },
    errorContainer: {
      backgroundColor: '#EF444415',
      borderRadius: 6,
      padding: 14,
      marginBottom: 14,
      flexDirection: 'row',
      alignItems: 'center',
      borderWidth: 1,
      borderColor: '#EF444430',
    },
    errorText: {
      fontSize: 13,
      fontFamily: 'Inter-Medium',
      color: '#EF4444',
      marginLeft: 8,
      flex: 1,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0,0,0,0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.surface,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      padding: 24,
      maxHeight: '80%',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 20,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    modalTitle: {
      fontSize: 18,
      fontFamily: 'Inter-Bold',
      color: colors.text,
    },
    modalProfileHeader: {
      alignItems: 'center',
      marginBottom: 20,
    },
    modalAvatar: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 12,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    modalAvatarText: {
      fontSize: 32,
      fontFamily: 'Inter-Bold',
      color: '#FFFFFF',
    },
    modalDriverName: {
      fontSize: 20,
      fontFamily: 'Inter-Bold',
      color: colors.text,
    },
    modalDriverSub: {
      fontSize: 13,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
      marginTop: 4,
    },
    modalDetailsGrid: {
      gap: 12,
      marginBottom: 20,
    },
    modalDetailCard: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.background,
      padding: 14,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    modalDetailIconBg: {
      width: 38,
      height: 38,
      borderRadius: 6,
      backgroundColor: colors.primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 14,
    },
    modalDetailLabel: {
      fontSize: 11.5,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
    },
    modalDetailValue: {
      fontSize: 14.5,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      marginTop: 1,
    },
    modalCloseBtn: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 8,
      alignItems: 'center',
    },
    modalCloseBtnText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontFamily: 'Inter-Bold',
    },
    floatingDutyContainer: {
      position: 'absolute',
      bottom: 24,
      right: 18,
      zIndex: 999,
    },
    floatingDutyPill: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingLeft: 14,
      paddingRight: 6,
      paddingVertical: 8,
      borderRadius: 24,
      gap: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 6,
    },
    floatingDutyPillCollapsed: {
      width: 50,
      height: 50,
      borderRadius: 25,
      paddingLeft: 0,
      paddingRight: 0,
      paddingVertical: 0,
      justifyContent: 'center',
      alignItems: 'center',
      gap: 0,
    },
    fabPulseDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
      alignItems: 'center',
      justifyContent: 'center',
    },
    fabPulseRing: {
      position: 'absolute',
      width: 18,
      height: 18,
      borderRadius: 9,
    },
    fabPulseInner: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: '#FFFFFF',
    },
    floatingDutyText: {
      color: '#FFFFFF',
      fontSize: 13,
      fontFamily: 'Inter-Bold',
      letterSpacing: 0.4,
    },
    floatingToggleInnerBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(255, 255, 255, 0.25)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    drawerContent: {
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 12,
      paddingBottom: 28,
      width: '100%',
    },
    drawerDragHandle: {
      width: 40,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.border,
      alignSelf: 'center',
      marginBottom: 16,
    },
    drawerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      marginBottom: 20,
    },
    drawerStatusIconBox: {
      width: 52,
      height: 52,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
    },
    drawerTitle: {
      fontSize: 17,
      fontFamily: 'Inter-Bold',
      color: colors.text,
    },
    drawerSub: {
      fontSize: 12.5,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
      marginTop: 2,
      lineHeight: 17,
    },
    drawerInfoGrid: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 20,
    },
    drawerGridCell: {
      flex: 1,
      backgroundColor: colors.background,
      borderRadius: 6,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    drawerCellLabel: {
      fontSize: 11.5,
      fontFamily: 'Inter-Medium',
      color: colors.textSecondary,
    },
    drawerCellValue: {
      fontSize: 14,
      fontFamily: 'Inter-Bold',
      color: colors.text,
      marginTop: 2,
    },
    drawerToggleActionBtn: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: 14,
      gap: 8,
      marginBottom: 10,
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: 0.2,
      shadowRadius: 6,
      elevation: 3,
    },
    drawerToggleActionBtnText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontFamily: 'Inter-Bold',
    },
    drawerCloseBtn: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    drawerCloseBtnText: {
      fontSize: 13.5,
      fontFamily: 'Inter-SemiBold',
      color: colors.textSecondary,
    },
  });

  if (isLoading) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ marginTop: 12, color: colors.textSecondary, fontFamily: 'Inter-Medium' }}>
            Loading Duty Profile...
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!isAuthenticated) {
    return (
      <SafeAreaView style={dynamicStyles.container}>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 32 }}>
          <AlertCircle color="#EF4444" size={32} />
          <Text style={{ marginTop: 12, color: colors.text, fontFamily: 'Inter-Bold', fontSize: 16, textAlign: 'center' }}>
            Couldn't Start Duty Session
          </Text>
          <Text style={{ marginTop: 6, color: colors.textSecondary, fontFamily: 'Inter-Medium', fontSize: 13, textAlign: 'center' }}>
            {error || 'Something went wrong while signing you in for duty.'}
          </Text>
          <TouchableOpacity
            style={{ marginTop: 20, backgroundColor: colors.primary, paddingHorizontal: 24, paddingVertical: 12, borderRadius: 6 }}
            onPress={() => signinAsOwner().catch(() => {})}
          >
            <Text style={{ color: '#FFFFFF', fontFamily: 'Inter-Bold', fontSize: 14 }}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={dynamicStyles.container} edges={embedded ? ['left', 'right'] : undefined}>
      {/* Checks GET /cardriver/me once per app open - added 2026-09-04,
          same reminder the owner-shell tab layout mounts, needed here too
          for a pure duty-driver login (no owner session at all). */}
      <ProfilePhotoReminder />
      <OverlayPermissionPrompt />
      {/* Top Header Bar with Profile Icon Button */}
      <View style={dynamicStyles.header}>
        <View style={dynamicStyles.headerLeft}>
          <TouchableOpacity 
            onPress={() => {
              if (router.canGoBack()) {
                safeBack(router);
              } else {
                router.replace('/(tabs)' as any);
              }
            }}
            style={dynamicStyles.backButton}
          >
            <ArrowLeft color={colors.text} size={20} />
          </TouchableOpacity>
          <Text style={dynamicStyles.headerTitle}>Duty Mode</Text>
        </View>

        <View style={dynamicStyles.headerRightGroup}>
          <TouchableOpacity 
            style={dynamicStyles.headerBadge}
            onPress={handleStatusToggle}
            disabled={statusLoading}
            activeOpacity={0.7}
          >
            <View style={dynamicStyles.headerBadgeDot} />
            <Text style={dynamicStyles.headerBadgeText}>
              {isOnline ? 'ON DUTY' : 'OFF DUTY'}
            </Text>
          </TouchableOpacity>

          {/* Profile Trigger Button */}
          <TouchableOpacity
            style={dynamicStyles.profileTriggerBtn}
            onPress={() => router.push('/car-driver/profile' as any)}
            accessibilityLabel="Open driver profile"
          >
            <Text style={dynamicStyles.profileTriggerAvatarText}>
              {driverName.charAt(0).toUpperCase()}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Edge-to-edge Tab Bar attached seamlessly directly beneath the header (Matching Admin App design) */}
      <View style={dynamicStyles.pinnedTabBar}>
        <TouchableOpacity 
          style={[dynamicStyles.edgeTab, bookingFilter === 'live' && dynamicStyles.edgeTabActive]}
          onPress={() => setBookingFilter('live')}
          activeOpacity={0.8}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View style={[
              { width: 7, height: 7, borderRadius: 3.5 },
              { backgroundColor: isOnline ? '#10B981' : '#9CA3AF' }
            ]} />
            <Text style={[dynamicStyles.edgeTabText, bookingFilter === 'live' && dynamicStyles.edgeTabTextActive]}>
              Live
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[dynamicStyles.edgeTab, bookingFilter === 'upcoming' && dynamicStyles.edgeTabActive]}
          onPress={() => setBookingFilter('upcoming')}
          activeOpacity={0.8}
        >
          <Text style={[dynamicStyles.edgeTabText, bookingFilter === 'upcoming' && dynamicStyles.edgeTabTextActive]}>
            Upcoming ({activeCount})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[dynamicStyles.edgeTab, bookingFilter === 'completed' && dynamicStyles.edgeTabActive]}
          onPress={() => setBookingFilter('completed')}
          activeOpacity={0.8}
        >
          <Text style={[dynamicStyles.edgeTabText, bookingFilter === 'completed' && dynamicStyles.edgeTabTextActive]}>
            Completed ({completedCount})
          </Text>
        </TouchableOpacity>
      </View>

      <ScrollView 
        style={dynamicStyles.content}
        refreshControl={
          <FreshRefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {error && (
          <View style={dynamicStyles.errorContainer}>
            <AlertCircle color="#EF4444" size={18} />
            <Text style={dynamicStyles.errorText}>{error}</Text>
            <TouchableOpacity onPress={clearError} style={{ padding: 4 }}>
              <Text style={{ color: '#EF4444', fontFamily: 'Inter-Bold', fontSize: 14 }}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {bookingFilter === 'live' ? (
          <LiveRadarSearching
            isOnline={isOnline}
            driverLocation={driverLocation}
            colors={colors}
            isDarkMode={isDarkMode}
            onGoOnline={handleStatusToggle}
            statusLoading={statusLoading}
          />
        ) : bookingsLoading ? (
          <View style={{ paddingVertical: 20, alignItems: 'center' }}>
            <ActivityIndicator size="small" color={colors.primary} />
          </View>
        ) : bookingFilter === 'completed' ? (
          filteredBookings.length > 0 ? (
            filteredBookings.map((booking, idx) => (
              <View key={booking.id || idx} style={dynamicStyles.bookingCard}>
                <View style={dynamicStyles.bookingHeader}>
                  <Text style={dynamicStyles.bookingId}>#{booking.booking_id || booking.id || 'TRIP'}</Text>
                  <View style={[dynamicStyles.statusBadge, { backgroundColor: '#D1FAE5' }]}>
                    <Text style={[dynamicStyles.statusBadgeText, { color: '#059669' }]}>
                      Completed
                    </Text>
                  </View>
                </View>

                <View style={dynamicStyles.routeRow}>
                  <View style={dynamicStyles.routeDot} />
                  <Text style={dynamicStyles.routeText} numberOfLines={1}>
                    {booking.from_city || booking.pickup_location || 'Pickup Location'}
                  </Text>
                </View>
                <View style={dynamicStyles.routeRow}>
                  <View style={[dynamicStyles.routeDot, dynamicStyles.routeDotDrop]} />
                  <Text style={dynamicStyles.routeText} numberOfLines={1}>
                    {booking.to_city || booking.drop_location || 'Drop Location'}
                  </Text>
                </View>

                {/* Rating / Review Sync Box */}
                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  backgroundColor: isDarkMode ? '#1E293B' : '#FEF3C7',
                  paddingHorizontal: 10,
                  paddingVertical: 6,
                  borderRadius: 6,
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: isDarkMode ? '#334155' : '#FDE68A',
                }}>
                  <Star size={14} color="#D97706" fill="#D97706" />
                  <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: '#B45309' }}>5.0 Rating</Text>
                  <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Medium', color: isDarkMode ? '#FDE047' : '#92400E' }}>
                    • Synced Passenger Review
                  </Text>
                </View>

                <View style={dynamicStyles.bookingFooter}>
                  <Text style={dynamicStyles.fareText}>₹{booking.fare || booking.amount || '0'}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#ECFDF5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 }}>
                    <CheckCircle color="#059669" size={14} />
                    <Text style={{ color: '#059669', fontSize: 12, fontFamily: 'Inter-Bold' }}>Trip Completed</Text>
                  </View>
                </View>
              </View>
            ))
          ) : (
            <View style={dynamicStyles.emptyCard}>
              <View style={[dynamicStyles.emptyIconBg, { backgroundColor: isDarkMode ? '#064E3B' : '#ECFDF5' }]}>
                <CheckCircle color="#10B981" size={28} />
              </View>
              <Text style={dynamicStyles.emptyTitle}>No Completed Rides Yet</Text>
              <Text style={dynamicStyles.emptySub}>
                Duty rides you finish and synced passenger ratings will automatically appear here.
              </Text>
            </View>
          )
        ) : (
          filteredBookings.length > 0 ? (
            filteredBookings.map((booking, idx) => (
              <View key={booking.id || idx} style={dynamicStyles.bookingCard}>
                <View style={dynamicStyles.bookingHeader}>
                  <Text style={dynamicStyles.bookingId}>#{booking.booking_id || booking.id || 'TRIP'}</Text>
                  <View style={dynamicStyles.statusBadge}>
                    <Text style={dynamicStyles.statusBadgeText}>
                      {booking.status || 'Assigned'}
                    </Text>
                  </View>
                </View>

                <View style={dynamicStyles.routeRow}>
                  <View style={dynamicStyles.routeDot} />
                  <Text style={dynamicStyles.routeText} numberOfLines={1}>
                    {booking.from_city || booking.pickup_location || 'Pickup Location'}
                  </Text>
                </View>
                <View style={dynamicStyles.routeRow}>
                  <View style={[dynamicStyles.routeDot, dynamicStyles.routeDotDrop]} />
                  <Text style={dynamicStyles.routeText} numberOfLines={1}>
                    {booking.to_city || booking.drop_location || 'Drop Location'}
                  </Text>
                </View>

                <View style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  backgroundColor: colors.background,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  borderRadius: 6,
                  marginTop: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}>
                  <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, marginRight: 8 }}>
                    <User color={colors.primary} size={15} />
                    <Text style={{ flexShrink: 1, fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text }}>
                      {booking.customer_name || 'Customer'}
                    </Text>
                  </View>

                  {booking.customer_phone && /^[+\d][\d\s-]*$/.test(booking.customer_phone) ? (
                    <TouchableOpacity
                      style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#10B9811F', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, gap: 4 }}
                      onPress={() => Linking.openURL(`tel:${booking.customer_phone}`)}
                    >
                      <Phone color="#10B981" size={13} />
                      <Text style={{ fontSize: 12, fontFamily: 'Inter-Bold', color: '#10B981' }}>
                        {booking.customer_phone}
                      </Text>
                    </TouchableOpacity>
                  ) : booking.raw?.customer_number_revealed === false && Number(booking.raw?.customer_number_reveal_in_seconds) > 0 ? (
                    <CustomerNumberCountdown seconds={Number(booking.raw.customer_number_reveal_in_seconds)} onUnlock={fetchBookings} />
                  ) : (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                      <Lock color={colors.textSecondary} size={12} />
                      <Text style={{ fontSize: 11, fontFamily: 'Inter-Medium', color: colors.textSecondary }}>
                        {booking.customer_phone || 'Not available'}
                      </Text>
                    </View>
                  )}
                </View>

                <View style={dynamicStyles.bookingFooter}>
                  <Text style={dynamicStyles.fareText}>₹{booking.fare || booking.amount || '0'}</Text>
                  <TouchableOpacity 
                    style={dynamicStyles.startTripBtn}
                    onPress={() => router.push({
                      pathname: '/trip/start',
                      params: {
                        assignment_id: String(booking.raw?.id || booking.id),
                        order_id: String(booking.booking_id || booking.id),
                        customerName: booking.customer_name || '',
                        pickup: booking.from_city || '',
                        drop: booking.to_city || '',
                        farePerKm: String(booking.fare || 0),
                        toll_charge_update: booking.raw?.toll_charge_update ? 'true' : 'false',
                        charge_items: JSON.stringify(booking.raw?.charge_items || []),
                        otp_required: booking.raw?.otp_required === false ? 'false' : 'true',
                      }
                    } as any)}
                  >
                    <Play color="#FFFFFF" size={14} />
                    <Text style={dynamicStyles.startTripBtnText}>Start Ride</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))
          ) : (
            <View style={dynamicStyles.emptyCard}>
              <View style={dynamicStyles.emptyIconBg}>
                <Briefcase color={colors.primary} size={28} />
              </View>
              <Text style={dynamicStyles.emptyTitle}>No Upcoming Duty Bookings</Text>
              <Text style={dynamicStyles.emptySub}>
                Pick up a Drop Cars booking from the open list and assign it to yourself to manage and execute the trip directly here.
              </Text>
              <TouchableOpacity
                style={dynamicStyles.emptyBtn}
                onPress={() => router.push({ pathname: '/(tabs)', params: { tab: 'new_bookings' } } as any)}
              >
                <Text style={dynamicStyles.emptyBtnText}>Browse Drop Cars Bookings</Text>
                <ChevronRight color={colors.primary} size={16} />
              </TouchableOpacity>
            </View>
          )
        )}

      </ScrollView>

      {/* Floating Bottom-Right Duty Action Pill - ONLY shown on Live tab when online; auto-collapses to circular icon after 2.8s */}
      {bookingFilter === 'live' && isOnline && (
        <View style={dynamicStyles.floatingDutyContainer} pointerEvents="box-none">
          <TouchableOpacity
            style={[
              dynamicStyles.floatingDutyPill,
              !isFabExpanded && dynamicStyles.floatingDutyPillCollapsed,
              { backgroundColor: '#EF4444' },
              statusLoading && { opacity: 0.7 }
            ]}
            onPress={() => {
              if (!isFabExpanded) {
                expandFabTemporarily();
              } else {
                if (fabCollapseTimerRef.current) clearTimeout(fabCollapseTimerRef.current);
                handleStatusToggle();
              }
            }}
            onLongPress={() => setStatusDrawerVisible(true)}
            activeOpacity={0.85}
          >
            {isFabExpanded ? (
              <>
                <View style={dynamicStyles.fabPulseDot}>
                  <View style={[
                    dynamicStyles.fabPulseRing,
                    { backgroundColor: '#FFFFFF50' }
                  ]} />
                  <View style={dynamicStyles.fabPulseInner} />
                </View>

                <Text style={dynamicStyles.floatingDutyText}>
                  Go Off Duty
                </Text>

                <TouchableOpacity
                  style={dynamicStyles.floatingToggleInnerBtn}
                  onPress={(e) => {
                    e.stopPropagation();
                    if (fabCollapseTimerRef.current) clearTimeout(fabCollapseTimerRef.current);
                    handleStatusToggle();
                  }}
                  disabled={statusLoading}
                >
                  {statusLoading ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <Power color="#FFFFFF" size={15} />
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <Power color="#FFFFFF" size={22} />
            )}
          </TouchableOpacity>
        </View>
      )}

      {/* Slide-Up Duty Status Drawer Modal */}
      <Modal
        visible={statusDrawerVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setStatusDrawerVisible(false)}
      >
        <TouchableOpacity
          style={dynamicStyles.modalOverlay}
          activeOpacity={1}
          onPress={() => setStatusDrawerVisible(false)}
        >
          <TouchableOpacity
            activeOpacity={1}
            style={[dynamicStyles.drawerContent, { backgroundColor: colors.surface }]}
            onPress={(e) => e.stopPropagation()}
          >
            <View style={dynamicStyles.drawerDragHandle} />

            <View style={dynamicStyles.drawerHeader}>
              <View style={[
                dynamicStyles.drawerStatusIconBox,
                { backgroundColor: isOnline ? '#10B9811F' : '#6B72801F', borderColor: isOnline ? '#10B98140' : '#6B728040' }
              ]}>
                {isOnline ? (
                  <Wifi color="#10B981" size={28} />
                ) : (
                  <WifiOff color="#6B7280" size={28} />
                )}
              </View>
              <View style={{ flex: 1 }}>
                <Text style={dynamicStyles.drawerTitle}>
                  {isOnline ? 'Active & Ready for Trips' : 'Off Duty / Offline Mode'}
                </Text>
                <Text style={dynamicStyles.drawerSub}>
                  {isOnline
                    ? 'You are currently active & available to execute duty rides.'
                    : 'Go online to start receiving and accepting new duty bookings.'}
                </Text>
              </View>
            </View>

            {/* Quick Status Info Grid inside Drawer */}
            <View style={dynamicStyles.drawerInfoGrid}>
              <View style={dynamicStyles.drawerGridCell}>
                <Text style={dynamicStyles.drawerCellLabel}>Operating City</Text>
                <Text style={dynamicStyles.drawerCellValue}>{driverLocation}</Text>
              </View>
              <View style={dynamicStyles.drawerGridCell}>
                <Text style={dynamicStyles.drawerCellLabel}>Duty Status</Text>
                <Text style={[
                  dynamicStyles.drawerCellValue,
                  { color: isOnline ? '#059669' : '#4B5563' }
                ]}>
                  {isOnline ? 'ONLINE' : 'OFFLINE'}
                </Text>
              </View>
            </View>

            {/* Action Toggle Button inside Drawer */}
            <TouchableOpacity
              style={[
                dynamicStyles.drawerToggleActionBtn,
                { backgroundColor: isOnline ? '#EF4444' : '#10B981' },
                statusLoading && { opacity: 0.7 }
              ]}
              onPress={() => {
                handleStatusToggle();
              }}
              disabled={statusLoading}
            >
              {statusLoading ? (
                <ActivityIndicator color="#FFFFFF" size="small" />
              ) : (
                <>
                  <Power color="#FFFFFF" size={18} />
                  <Text style={dynamicStyles.drawerToggleActionBtnText}>
                    {isOnline ? 'Go Off Duty' : 'Go Online'}
                  </Text>
                </>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={dynamicStyles.drawerCloseBtn}
              onPress={() => setStatusDrawerVisible(false)}
            >
              <Text style={dynamicStyles.drawerCloseBtnText}>Close Drawer</Text>
            </TouchableOpacity>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </SafeAreaView>
  );
}
