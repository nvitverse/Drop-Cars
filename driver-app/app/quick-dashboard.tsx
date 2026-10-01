import FreshRefreshControl from '@/components/FreshRefreshControl';
import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ScrollView,
  RefreshControl,
  ActivityIndicator,
  Animated,
  Modal,
  BackHandler,
  Switch,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from '@/contexts/ThemeContext';
import { useCarDriver } from '@/contexts/CarDriverContext';
import * as SecureStore from '@/utils/secureStore';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useLanguage } from '@/contexts/LanguageContext';
import { useFocusEffect } from '@react-navigation/native';
import { 
  MapPin, 
  User, 
  Phone, 
  Car, 
  ArrowRight, 
  LogOut, 
  RefreshCw,
  MessageCircle,
  Clock,
  Navigation,
  CheckCircle,
  AlertCircle,
  FileText,
  IndianRupee,
  Moon,
  Repeat,
  X,
  Search,
  Calendar,
  ChevronRight,
  Filter,
} from 'lucide-react-native';
import { startTrip, endTrip } from '@/services/driver/carDriverService';
import axiosDriver from '@/app/api/axiosDriver';
import axiosInstance from '@/app/api/axiosInstance';
import LoadingOverlay from '@/components/LoadingOverlay';
import EmptyState from '@/components/EmptyState';
import CallButton from '@/components/CallButton';
import CustomerNumberCountdown from '@/components/CustomerNumberCountdown';
import { getBookingStatusLabel } from '@/utils/bookingStatus';
import { formatBookingId, formatCarType as cleanFormatCarType } from '@/utils/format';
import Svg, { Path, Circle } from 'react-native-svg';
// Removed test notification button
interface DriverOrder {
  id: number;
  order_id: number;
  assignment_status: string;
  customer_name: string;
  customer_number: string;
  pickup_drop_location: Record<string, string>;
  start_date_time: string;
  trip_type: string;
  car_type: string;
  estimated_price: number;
  assigned_at: string;
  created_at: string;
  pickup?: string;
  drop?: string;
  customer_mobile?: string;
  total_fare?: number;
  assignment_id?: number;
  scheduled_at?: string;
  toll_charge_update?: boolean; // Add toll charge update flag
  pickup_notes?: string;
  // Vendor information
  vendor_name?: string;
  vendor_primary_number?: string;
  vendor_secondary_number?: string;
  waiting_time?: number | null;
  waiting_charge?: number | null;
  night_charges?: number | null;
  // Which named charges are bundled into the total vs. collected extra by
  // the driver directly from the customer - see trip/end.tsx.
  charge_items?: { label: string; included: boolean }[];
  // Ground truth for whether trip/start.tsx and trip/end.tsx must collect
  // an OTP - see DriverOrderListResponse.otp_required.
  otp_required?: boolean;
}

export default function QuickDashboardScreen({ embedded = false }: { embedded?: boolean } = {}) {
  const { user, logout } = useAuth();
  const { colors } = useTheme();
  const { t } = useLanguage();
  const router = useRouter();
  const { tripJustCompleted } = useLocalSearchParams<{ tripJustCompleted?: string }>();

  // One-time dismissible hint shown after the driver returns here from a
  // just-completed trip, pointing them back to the fleet-owner side to
  // accept new bookings/trips (only fleet owners can accept bookings).
  const [showTripCompletedHint, setShowTripCompletedHint] = useState(!!tripJustCompleted);
  const { openHistory } = useLocalSearchParams<{ openHistory?: string }>();

  // State management
  const [driverStatus, setDriverStatus] = useState<'ONLINE' | 'OFFLINE' | 'DRIVING'>('OFFLINE');
  const [driverOrders, setDriverOrders] = useState<DriverOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [statusChanging, setStatusChanging] = useState(false);
  // True when the user is also logged in as a fleet owner (came here via the "Start Driving" switch).
  const [hasOwnerSession, setHasOwnerSession] = useState(false);

  // A finished trip whose last step (rate the customer + confirm cash) was never done: take the driver back to it.
  useEffect(() => {
    SecureStore.getItemAsync('pendingTripCompletion')
      .then((id) => {
        if (id && !tripJustCompleted) router.replace({ pathname: '/trip/complete', params: { order_id: id } } as any);
      })
      .catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // Detect an existing fleet-owner session so we can offer a one-tap return.
    SecureStore.getItemAsync('authToken')
      .then((ownerToken) => setHasOwnerSession(!!ownerToken))
      .catch(() => setHasOwnerSession(false));
  }, []);

  // Switch back to the fleet-owner side. The stored owner token can be stale
  // (e.g. expired) - navigating blindly used to crash with "session expired".
  // Validate it first; if dead, clean up and take the user to owner login.
  const handleSwitchToOwner = async () => {
    try {
      const ownerToken = await SecureStore.getItemAsync('authToken');
      if (!ownerToken) {
        setHasOwnerSession(false);
        router.replace('/login');
        return;
      }
      const check = await axiosInstance.get('/api/users/vehicle-owner/me', {
        headers: { Authorization: `Bearer ${ownerToken}` },
      });
      if (check?.status === 200) {
        // Make the switch sticky: an app restart will now land on the owner side
        await SecureStore.setItemAsync('ownerLastLogin', Date.now().toString()).catch(() => {});
        await SecureStore.setItemAsync('lastActiveRole', 'owner').catch(() => {});
        await SecureStore.deleteItemAsync('driverLastLogin').catch(() => {});
        router.replace('/(tabs)');
        return;
      }
      throw new Error('owner session invalid');
    } catch {
      // Owner login no longer valid - clear the stale session and go to the
      // owner login screen (mobile number is prefilled there).
      try {
        await SecureStore.deleteItemAsync('authToken');
        await SecureStore.deleteItemAsync('userData');
      } catch {}
      setHasOwnerSession(false);
      Alert.alert(
        t('quickDashboard.fleetLoginNeededTitle'),
        t('quickDashboard.fleetLoginNeededBody'),
        [{ text: t('quickDashboard.signIn'), onPress: () => router.replace('/login') }]
      );
    }
  };
  const [activeTrip, setActiveTrip] = useState<DriverOrder | null>(null);
  const [tripActionLoading, setTripActionLoading] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [historyVisible, setHistoryVisible] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [orderHistory, setOrderHistory] = useState<any[]>([]);
  const [historyError, setHistoryError] = useState('');
  const [expandedOrderId, setExpandedOrderId] = useState<number | null>(null);

  // Real Driver Profile state
  const [driverProfile, setDriverProfile] = useState<any>(null);

  // Tabs state: Upcoming Trips (1st) vs Assigned Bookings (2nd)
  const [activeTab, setActiveTab] = useState<'upcoming' | 'assigned'>('upcoming');

  // History search, filter & detail view state
  const [historySearch, setHistorySearch] = useState('');
  const [historyTimeFilter, setHistoryTimeFilter] = useState<'all' | 'today' | 'this_week'>('all');
  const [selectedHistoryOrder, setSelectedHistoryOrder] = useState<any | null>(null);

  // Animation values
  const statusAnimation = useState(new Animated.Value(0))[0];
  const pulseAnimation = useState(new Animated.Value(1))[0];

  // Get driver info from real driver profile or login data
  const driverInfo = {
    name: driverProfile?.full_name || driverProfile?.fullName || user?.fullName || 'Duty Driver',
    phone: driverProfile?.mobile || driverProfile?.primary_mobile || driverProfile?.primaryMobile || user?.primaryMobile || '',
    driverId: driverProfile?.id || user?.id || '',
    status: driverStatus
  };

  // Debug authentication function
  const debugAuthentication = useCallback(async () => {
    try {
      const driverToken = await SecureStore.getItemAsync('driverAuthToken');
      console.log('🔍 Driver token exists:', !!driverToken);
      console.log('🔍 Driver token preview:', driverToken ? `${driverToken.substring(0, 20)}...` : 'None');
      
      if (!driverToken) {
        console.error('❌ No driver token found');
        return false;
      }
      
      // Test the API call with explicit headers
      const response = await axiosDriver.get('/api/assignments/driver/assigned-orders', {
        headers: {
          'Authorization': `Bearer ${driverToken}`,
          'Content-Type': 'application/json'
        }
      });
      
      console.log('✅ Debug API call successful:', response.data);
      return true;
    } catch (error: any) {
      console.error('❌ Debug API call failed:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data
      });
      return false;
    }
  }, []);

  // Debug token storage
  const debugTokenStorage = useCallback(async () => {
    try {
      const { debugTokenStorage } = useCarDriver();
      await debugTokenStorage();
    } catch (error) {
      console.error('❌ Debug token storage failed:', error);
    }
  }, []);

  // REMOVED: Old test functions - using simplified API now

  // Debug notification token function
  const debugNotificationToken = useCallback(async () => {
    try {
      console.log('🔍 Debugging notification token...');
      
      // Check SecureStore
      const storedToken = await SecureStore.getItemAsync('expoPushToken');
      console.log('📱 Stored Expo token:', storedToken ? `${storedToken.substring(0, 20)}...` : 'NOT FOUND');
      
      // Check current notification settings
      const { getDriverNotificationSettings } = await import('@/services/notifications/driverNotificationApi');
      try {
        const currentSettings = await getDriverNotificationSettings();
        console.log('📱 Current settings token:', currentSettings?.token ? `${currentSettings.token.substring(0, 20)}...` : 'NOT FOUND');
      } catch (error: any) {
        console.log('📱 Current settings error:', error.message);
      }
      
      // Check notification service (SIMPLIFIED)
      console.log('📱 Notification service: Using simple vendor app approach');
      
    } catch (error) {
      console.error('❌ Debug notification token failed:', error);
    }
  }, []);

  // SIMPLIFIED: Debug functions using the new simple API

  // Removed notification toggle functionality for Quick Driver

  // Optimized data fetching with proper authentication
  const loadDriverData = useCallback(async () => {
    try {
      setLoading(true);
      console.log('🔄 Loading driver data...');
      
      // Check if driver token exists
      const driverToken = await SecureStore.getItemAsync('driverAuthToken');
      const driverUserData = await SecureStore.getItemAsync('driverAuthInfo');

      console.log('🔍 Driver auth check:', {
        hasToken: !!driverToken,
        hasUserData: !!driverUserData,
        hasUserContext: !!user?.id,
        tokenPreview: driverToken ? `${driverToken.substring(0, 20)}...` : 'None'
      });

      // The Duty Status toggle below was defaulting to OFFLINE and getting
      // its "real" value only from useAuth()'s user.driver_status - but
      // that context is the FLEET-OWNER session (SecureStore 'userData'),
      // which none of loginDriver()/loginDriverAsOwner()/
      // loginDriverWithFirebase() ever populate (they deliberately avoid
      // touching the owner's session). So for any driver-only login, the
      // toggle just showed the hardcoded default regardless of the real
      // backend status, and tapping it against an account that was
      // actually already ONLINE (e.g. from a previous session that never
      // went back offline) failed with "must be OFFLINE first" while the
      // UI still showed Offline. driverAuthInfo below IS written by every
      // login path with the real driver_status - use that as the source
      // of truth instead.
      if (driverUserData) {
        try {
          const parsedDriverInfo = JSON.parse(driverUserData);
          setDriverProfile(parsedDriverInfo);
          const realStatus = String(parsedDriverInfo?.driver_status || '').toUpperCase();
          if (realStatus === 'ONLINE' || realStatus === 'OFFLINE' || realStatus === 'DRIVING') {
            setDriverStatus(realStatus as 'ONLINE' | 'OFFLINE' | 'DRIVING');
          }
        } catch (e) {
          console.warn('⚠️ Could not parse driverAuthInfo for status sync:', e);
        }
      }

      // Fetch live driver profile
      try {
        const meRes = await axiosDriver.get('/api/users/cardriver/me');
        if (meRes?.data) {
          setDriverProfile((prev: any) => ({
            ...prev,
            ...meRes.data,
            fullName: meRes.data.full_name || meRes.data.fullName || prev?.fullName,
            primaryMobile: meRes.data.mobile || meRes.data.primaryMobile || prev?.primaryMobile,
          }));
        }
      } catch (meErr) {
        console.log('ℹ️ Driver self profile fetch note:', meErr);
      }

      if (!driverToken) {
        console.error('❌ No driver token found');
        // Silently redirect to login without alarming fresh users
        router.replace('/quick-login');
        return;
      }
      
      // Validate token expiration
      const { isJWTExpired } = await import('@/utils/jwtDecoder');
      if (isJWTExpired(driverToken)) {
        console.error('❌ Driver token expired');
        // Silently redirect to login
        router.replace('/quick-login');
        return;
      }
      
      console.log('🔑 Driver token valid, making API call...');
      
      const response = await axiosDriver.get('/api/assignments/driver/assigned-orders');
      const orders = Array.isArray(response.data) ? response.data : [];
      
      console.log('📦 Raw API response:', response.data);
      console.log('📦 Orders count:', orders.length);
      
      // Optimized mapping
      const mappedOrders = orders.map((order: any) => ({
        ...order,
        pickup: Object.values(order.pickup_drop_location || {})[0] || 'Unknown',
        drop: Object.values(order.pickup_drop_location || {})[1] || 'Unknown',
        customer_mobile: order.customer_number,
        total_fare: order.estimated_price || 0,
        assignment_id: order.id,
        scheduled_at: order.start_date_time,
        toll_charge_update: order.toll_charge_update || false, // Map toll charge update flag
        // Map vendor information
        vendor_name: order.vendor_name,
        vendor_primary_number: order.vendor_primary_number,
        vendor_secondary_number: order.vendor_secondary_number,
        waiting_time: order.waiting_time ?? order.waiting_minutes ?? null,
        waiting_charge: order.waiting_charge ?? order.waiting_charges ?? null,
        night_charges: order.night_charges ?? order.night_charge ?? null,
        // Map pickup notes
        pickup_notes: order.pickup_notes || null,
      }));
      
      setDriverOrders(mappedOrders);
      console.log('✅ Driver data loaded:', mappedOrders.length, 'orders');

      // Derive active trip and status
      const drivingOrder = mappedOrders.find((o: any) => String(o.assignment_status).toUpperCase() === 'DRIVING');
      if (drivingOrder) {
        setActiveTrip(drivingOrder);
        setDriverStatus('DRIVING');
      } else {
        setActiveTrip(null);
        if (driverStatus === 'DRIVING') setDriverStatus('ONLINE');
      }
      
    } catch (error: any) {
      console.error('❌ Failed to load driver data:', error);
      console.error('❌ Error details:', {
        message: error.message,
        status: error.response?.status,
        data: error.response?.data,
      });
      
      setDriverOrders([]);
      
      if (error.response?.status === 401) {
        Alert.alert(
          t('quickDashboard.authErrorTitle'),
          t('quickDashboard.authErrorBody'),
          [{ text: t('quickDashboard.ok'), onPress: () => router.replace('/quick-login') }]
        );
      } else if (error.message.includes('Network Error')) {
        Alert.alert(
          t('quickDashboard.connectionErrorTitle'),
          t('quickDashboard.connectionErrorBody'),
          [{ text: t('quickDashboard.ok') }]
        );
      } else {
        Alert.alert(
          t('quickDashboard.errorTitle'),
          t('quickDashboard.loadOrdersFailed', { detail: error.response?.data?.detail || error.message }),
          [{ text: t('quickDashboard.ok') }]
        );
      }
    } finally {
      setLoading(false);
    }
  }, [router]);

  const handleLogout = useCallback(async () => {
      Alert.alert(
      t('quickDashboard.logoutTitle'),
      t('quickDashboard.logoutBody'),
      [
        { text: t('quickDashboard.cancel'), style: 'cancel' },
        {
          text: t('quickDashboard.logout'),
          style: 'destructive',
          onPress: async () => {
            await SecureStore.deleteItemAsync('driverAuthToken');
            await SecureStore.deleteItemAsync('driverAuthInfo');
            logout();
            router.replace('/quick-login');
            }
          }
        ]
      );
  }, [logout, router]);

  // Refresh when screen gains focus
  useFocusEffect(
    useCallback(() => {
      loadDriverData();
      
      // Handle back button press
      const backHandler = BackHandler.addEventListener('hardwareBackPress', () => {
        // Show logout confirmation alert
        Alert.alert(
          t('quickDashboard.logoutTitle'),
          t('quickDashboard.logoutBody'),
          [
            { text: t('quickDashboard.cancel'), style: 'cancel', onPress: () => false },
            {
              text: t('quickDashboard.logout'),
              style: 'destructive',
              onPress: async () => {
                await handleLogout();
                return true;
              }
            }
          ]
        );
        return true; // Prevent default back behavior
      });

      return () => backHandler.remove();
    }, [loadDriverData, handleLogout])
  );

  // New API functions for driver status
  const setDriverOnlineAPI = async () => {
    try {
      console.log('🟢 Setting driver online via API...');
      const response = await axiosDriver.put('/api/users/cardriver/online');
      console.log('✅ Driver set online successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Failed to set driver online:', error);
      throw new Error(error.response?.data?.message || error.message || 'Failed to set driver online');
    }
  };

  const setDriverOfflineAPI = async () => {
    try {
      console.log('🔴 Setting driver offline via API...');
      const response = await axiosDriver.put('/api/users/cardriver/offline');
      console.log('✅ Driver set offline successfully:', response.data);
      return response.data;
    } catch (error: any) {
      console.error('❌ Failed to set driver offline:', error);
      throw new Error(error.response?.data?.message || error.message || 'Failed to set driver offline');
    }
  };

  // Optimized status toggle with new API
  const toggleDriverStatus = useCallback(async (newValue: boolean) => {
    if (statusChanging || isLoading) return;
    
    // Prevent going online if currently driving
    if (newValue && driverStatus === 'DRIVING') {
      Alert.alert(
        t('quickDashboard.cannotGoOnlineTitle'),
        t('quickDashboard.cannotGoOnlineBody'),
        [{ text: t('quickDashboard.ok') }]
      );
      return;
    }
    
    try {
      setStatusChanging(true);
      setIsLoading(true);
      const newStatus = newValue ? 'ONLINE' : 'OFFLINE';
      
      // Animate status change
      Animated.sequence([
        Animated.timing(statusAnimation, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.timing(statusAnimation, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      // API call with new endpoints
      const response = newValue 
        ? await setDriverOnlineAPI()
        : await setDriverOfflineAPI();
      
      // Update status on successful response
      setDriverStatus(newStatus);
      console.log(`✅ Driver set ${newStatus.toLowerCase()}:`, response);

      // Keep the persisted driverAuthInfo (the source of truth loadDriverData
      // syncs from on every load/refresh) in step, so a later reload doesn't
      // revert the toggle back to a stale status.
      try {
        const driverUserData = await SecureStore.getItemAsync('driverAuthInfo');
        if (driverUserData) {
          const parsedDriverInfo = JSON.parse(driverUserData);
          parsedDriverInfo.driver_status = newStatus;
          await SecureStore.setItemAsync('driverAuthInfo', JSON.stringify(parsedDriverInfo));
        }
      } catch (e) {
        console.warn('⚠️ Could not persist updated driver_status to driverAuthInfo:', e);
      }

    } catch (error: any) {
      console.error('❌ Status toggle failed:', error.message);
      Alert.alert(
        t('quickDashboard.statusUpdateFailedTitle'),
        error.message || t('quickDashboard.statusUpdateFailedGeneric'),
        [{ text: t('quickDashboard.ok') }]
      );
    } finally {
      setStatusChanging(false);
      setIsLoading(false);
    }
  }, [statusChanging, statusAnimation, driverStatus, isLoading]);

  // Check for active trips and update driver status
  const checkActiveTrips = useCallback(() => {
    const activeTripOrder = driverOrders.find(order => 
      order.assignment_status === 'DRIVING' || 
      order.assignment_status === 'STARTED'
    );
    
    if (activeTripOrder) {
      setActiveTrip(activeTripOrder);
      if (driverStatus !== 'DRIVING') {
        setDriverStatus('DRIVING');
        console.log('🚗 Active trip detected, updating driver status to DRIVING');
      }
    } else {
      setActiveTrip(null);
      if (driverStatus === 'DRIVING') {
        setDriverStatus('ONLINE');
        console.log('✅ No active trip, updating driver status to ONLINE');
      }
    }
  }, [driverOrders, driverStatus]);

  // Check for active trips when orders change
  useEffect(() => {
    checkActiveTrips();
  }, [checkActiveTrips]);

  // Initialize data
  useEffect(() => {
    // Set initial driver status from login response
    if (user?.driver_status) {
      const status = user.driver_status.toUpperCase();
      console.log('🔍 Setting initial driver status from user data:', status);
      if (status === 'ONLINE' || status === 'OFFLINE' || status === 'DRIVING') {
        setDriverStatus(status as 'ONLINE' | 'OFFLINE' | 'DRIVING');
      } else {
        setDriverStatus('OFFLINE');
      }
    }
    
    // Debug authentication first
    debugAuthentication().then((success) => {
      if (success) {
        loadDriverData();
      } else {
        console.log('🔍 Authentication debug failed, trying to load data anyway...');
        loadDriverData();
      }
    });
  }, [user?.driver_status, loadDriverData, debugAuthentication]);

  // Pulse animation for online status
  useEffect(() => {
    if (driverStatus === 'ONLINE') {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnimation, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnimation, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    }
  }, [driverStatus, pulseAnimation]);


  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadDriverData();
    setRefreshing(false);
  }, [loadDriverData]);

  // Trip management functions
  const handleStartTrip = useCallback(async (order: DriverOrder) => {
    if (isLoading || tripActionLoading === order.order_id) return;
    
    // Check if driver is already on a trip
    if (activeTrip) {
      Alert.alert(
        t('quickDashboard.activeTripTitle'),
        t('quickDashboard.activeTripBody'),
        [{ text: t('quickDashboard.ok') }]
      );
      return;
    }

    // Check driver status - can only start trip when ONLINE
    if (driverStatus !== 'ONLINE') {
      Alert.alert(
        t('quickDashboard.cannotStartTripTitle'),
        t('quickDashboard.cannotStartTripBody', { status: driverStatus }),
        [
          { text: t('quickDashboard.cancel'), style: 'cancel' },
          {
            text: t('quickDashboard.goOnline'),
            onPress: () => {
              if (driverStatus === 'OFFLINE') {
                toggleDriverStatus(true);
              } else {
                Alert.alert(
                  t('quickDashboard.statusConflictTitle'),
                  t('quickDashboard.statusConflictBody'),
                  [{ text: t('quickDashboard.ok') }]
                );
              }
            }
          }
        ]
      );
      return;
    }

    try {
      setTripActionLoading(order.order_id);
      setIsLoading(true);
      
      // Navigate to trip start screen
      router.push({
        pathname: '/trip/start',
        params: {
          assignment_id: order.assignment_id,
          order_id: order.order_id,
          customerName: order.customer_name,
          pickup: order.pickup,
          drop: order.drop,
          farePerKm: String(order.total_fare || 0),
          toll_charge_update: order.toll_charge_update ? 'true' : 'false',
          charge_items: JSON.stringify(order.charge_items || []),
          // Self-sourced bookings (Create Booking) never email a customer,
          // so there's no OTP for the driver to receive at all - see
          // driver_create_booking_confirm in order_assignments.py, which
          // deliberately leaves start_trip_otp/end_trip_otp unset for them.
          otp_required: order.otp_required === false ? 'false' : 'true',
        }
      });

      // Optimistically set active trip and status
      setActiveTrip(order);
      setDriverStatus('DRIVING');
    } catch (error) {
      console.error('❌ Error starting trip:', error);
      Alert.alert(t('quickDashboard.errorTitle'), t('quickDashboard.startTripFailed'));
    } finally {
      setTripActionLoading(null);
      setIsLoading(false);
    }
  }, [activeTrip, driverStatus, router, toggleDriverStatus, isLoading, tripActionLoading]);

  const handleEndTrip = useCallback(async (order: DriverOrder) => {
    if (isLoading || tripActionLoading === order.order_id) return;
    
    try {
      setTripActionLoading(order.order_id);
      setIsLoading(true);
      
      // Navigate to trip end screen
      router.push({
        pathname: '/trip/end',
        params: {
          assignment_id: order.assignment_id,
          order_id: order.order_id,
          customerName: order.customer_name,
          pickup: order.pickup,
          drop: order.drop,
          startKm: '0', // Default start KM, will be updated from trip start
          farePerKm: '0', // Default fare per KM
          toll_charge_update: order.toll_charge_update ? 'true' : 'false', // Pass toll charge update flag
          charge_items: JSON.stringify(order.charge_items || []),
          // Self-sourced bookings (Create Booking) never email a customer,
          // so there's no OTP for the driver to receive at all - see
          // driver_create_booking_confirm in order_assignments.py, which
          // deliberately leaves start_trip_otp/end_trip_otp unset for them.
          otp_required: order.otp_required === false ? 'false' : 'true',
          trip_type: order.trip_type || '', // Pass trip type to determine if multicity
          is_multicity: (() => {
            const t = String(order.trip_type || '').toLowerCase();
            return (t.includes('multy city') || t.includes('multi') || t.includes('multy')) ? 'true' : 'false';
          })(),
        }
      });

      // Optimistically clear active trip and status
      setActiveTrip(null);
      setDriverStatus('ONLINE');
    } catch (error) {
      console.error('❌ Error ending trip:', error);
      Alert.alert(t('quickDashboard.errorTitle'), t('quickDashboard.endTripFailed'));
    } finally {
      setTripActionLoading(null);
      setIsLoading(false);
    }
  }, [router, isLoading, tripActionLoading]);

  const navigateToTrip = useCallback((order: DriverOrder) => {
    const isThisActive = activeTrip && activeTrip.order_id === order.order_id;
    const isDriving = String(order.assignment_status).toUpperCase() === 'DRIVING';
    if (isThisActive || isDriving) {
      router.push({
        pathname: '/trip/end',
        params: {
          assignment_id: order.assignment_id,
          order_id: order.order_id,
          customerName: order.customer_name,
          pickup: order.pickup,
          drop: order.drop,
          startKm: '0',
          farePerKm: '0',
          toll_charge_update: order.toll_charge_update ? 'true' : 'false',
          charge_items: JSON.stringify(order.charge_items || []),
          // Self-sourced bookings (Create Booking) never email a customer,
          // so there's no OTP for the driver to receive at all - see
          // driver_create_booking_confirm in order_assignments.py, which
          // deliberately leaves start_trip_otp/end_trip_otp unset for them.
          otp_required: order.otp_required === false ? 'false' : 'true',
        }
      });
    } else {
      router.push({
        pathname: '/trip/start',
        params: {
          assignment_id: order.assignment_id,
          order_id: order.order_id,
          customerName: order.customer_name,
          pickup: order.pickup,
          drop: order.drop,
          farePerKm: String(order.total_fare || 0),
          toll_charge_update: order.toll_charge_update ? 'true' : 'false',
          charge_items: JSON.stringify(order.charge_items || []),
          // Self-sourced bookings (Create Booking) never email a customer,
          // so there's no OTP for the driver to receive at all - see
          // driver_create_booking_confirm in order_assignments.py, which
          // deliberately leaves start_trip_otp/end_trip_otp unset for them.
          otp_required: order.otp_required === false ? 'false' : 'true',
          trip_type: order.trip_type || '',
          is_multicity: (() => {
            const t = String(order.trip_type || '').toLowerCase();
            return (t.includes('multicity') || t.includes('multi') || t.includes('multy')) ? 'true' : 'false';
          })(),
        }
      });
    }
  }, [router, activeTrip]);

  const formatDateTime = (dateTime: string) => {
    const date = new Date(dateTime);
    return {
      date: date.toLocaleDateString(),
      time: date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'assigned': return '#10B981';
      case 'pending': return '#F59E0B';
      case 'completed': return '#6B7280';
      default: return '#6B7280';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status.toLowerCase()) {
      case 'assigned': return <CheckCircle size={16} color="#10B981" />;
      case 'pending': return <Clock size={16} color="#F59E0B" />;
      default: return <AlertCircle size={16} color="#6B7280" />;
    }
  };

  // Helper function to format car type for display
  const formatCarType = (carType: string | null | undefined): string => {
    if (!carType) return '';
    return cleanFormatCarType(carType);
  };

  const fetchOrderHistory = async () => {
    setHistoryLoading(true); setHistoryError('');
    try {
      // Use driver API with bearer token from axiosDriver interceptor
      const res = await axiosDriver.get('/api/assignments/driver/assigned/completed-trips');
      setOrderHistory(Array.isArray(res.data) ? res.data : []);
    } catch(e: any) {
      setOrderHistory([]);
      setHistoryError(e?.response?.data?.detail || e?.message || t('quickDashboard.loadHistoryFailed'));
    } finally { setHistoryLoading(false); }
  };

  // Filter upcoming orders for next 6 hours tab
  const upcomingOrders = useMemo(() => {
    const now = Date.now();
    const sixHoursMs = 6 * 60 * 60 * 1000;
    return driverOrders.filter((order: DriverOrder) => {
      const isDriving = String(order.assignment_status).toUpperCase() === 'DRIVING';
      if (isDriving) return true;
      const rawTime = order.scheduled_at || order.start_date_time;
      if (!rawTime) return false;
      const timeMs = new Date(rawTime).getTime();
      if (isNaN(timeMs)) return false;
      return timeMs <= (now + sixHoursMs) && timeMs >= (now - 45 * 60 * 1000);
    });
  }, [driverOrders]);

  // History filtering & search
  const filteredOrderHistory = useMemo(() => {
    let list = [...orderHistory];
    
    // Time filter
    if (historyTimeFilter === 'today') {
      const todayStr = new Date().toDateString();
      list = list.filter(o => {
        const dt = o.start_date_time || o.created_at;
        return dt && new Date(dt).toDateString() === todayStr;
      });
    } else if (historyTimeFilter === 'this_week') {
      const now = new Date();
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      list = list.filter(o => {
        const dt = o.start_date_time || o.created_at;
        return dt && new Date(dt) >= weekAgo;
      });
    }

    // Search query
    if (historySearch.trim()) {
      const q = historySearch.toLowerCase().trim();
      list = list.filter(o => {
        const idStr = String(o.order_id || o.id || o.source_order_id || '');
        const custStr = String(o.customer_name || '').toLowerCase();
        const vendorStr = String(o.vendor_name || '').toLowerCase();
        const pickupStr = String((o.pickup_drop_location && o.pickup_drop_location['0']) || o.pickup || '').toLowerCase();
        const dropStr = String((o.pickup_drop_location && o.pickup_drop_location['1']) || o.drop || '').toLowerCase();
        return idStr.includes(q) || custStr.includes(q) || vendorStr.includes(q) || pickupStr.includes(q) || dropStr.includes(q);
      });
    }

    return list;
  }, [orderHistory, historyTimeFilter, historySearch]);

  // Menu -> "Duty Trip History" opens this screen straight on the history list
  useEffect(() => {
    if (openHistory === '1') {
      setHistoryVisible(true);
      fetchOrderHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [openHistory]);

  const totalCashCollected = useMemo(() => {
    return filteredOrderHistory.reduce((sum, o) => sum + (Number(o.closed_vendor_price) || 0), 0);
  }, [filteredOrderHistory]);

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={embedded ? ['left', 'right'] : undefined}>
      <LoadingOverlay 
        visible={isLoading || statusChanging} 
        message={statusChanging ? t('quickDashboard.updatingStatus') : t('quickDashboard.loading')}
      />
      
      {/* Header - hidden when this screen lives inside the Duty tab (the tab already has its own header) */}
      {!embedded && (
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <View style={styles.headerContent}>
          <View style={styles.driverInfo}>
            <View style={styles.avatar}>
              <Svg width={36} height={36} viewBox="0 0 64 64" stroke={colors.primary} strokeWidth={2.5} fill="none">
                {/* Head */}
                <Circle cx="32" cy="20" r="10" strokeLinejoin="round" />
                {/* Cap brim and body */}
                <Path d="M22 16 Q32 8 42 16" />
                <Path d="M24 16 h16 v5 h-16z" />
                {/* Cap front line */}
                <Path d="M29 19 h6" strokeLinecap="round" />
                {/* Ears */}
                <Path d="M21 21 q-2 4 2 6" />
                <Path d="M43 21 q2 4 -2 6" />
                {/* Body/torso outline */}
                <Path d="M20 38 Q10 46 16 56 h32 q6-10-4-18" />
                {/* Arms/hands to steering wheel */}
                <Path d="M22 44 Q32 62 42 44" />
                {/* Steering wheel outer */}
                <Circle cx="32" cy="48" r="10" />
                {/* Steering wheel spokes */}
                <Path d="M32 38 v10" />
                <Path d="M32 48 h9" />
                <Path d="M32 48 h-9" />
                <Path d="M27 53 l5 -5 5 5" />
                {/* Center hub */}
                <Circle cx="32" cy="48" r="2.2" fill={colors.primary} />
              </Svg>
            </View>
            <View style={styles.driverDetails}>
              <Text style={[styles.driverName, { color: colors.text }]}>
                {driverInfo.name}
              </Text>
              <Text style={[styles.driverPhone, { color: colors.textSecondary }]}>
                {driverInfo.phone}
              </Text>
            </View>
          </View>
          
          <View style={styles.headerActions}>
            <TouchableOpacity
              onPress={() => router.push('/chats' as any)}
              accessibilityLabel="Chats"
              style={[styles.logoutButton, { marginRight: 8 }]}
            >
              <MessageCircle size={18} color={colors.primary} />
            </TouchableOpacity>
            {hasOwnerSession && (
              <TouchableOpacity
                onPress={handleSwitchToOwner}
                style={[styles.logoutButton, { flexDirection: 'row', alignItems: 'center', gap: 4, marginRight: 8 }]}
                accessibilityRole="button"
              >
                <Repeat size={18} color={colors.primary} />
                <Text style={{ color: colors.primary, fontWeight: '600', fontSize: 13 }}>{t('quickDashboard.owner')}</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity onPress={handleLogout} style={styles.logoutButton}>
              <LogOut size={20} color={colors.error} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      )}

      {/* Visible online/offline status control - wired to the existing
          toggleDriverStatus function. Previously there was no always-visible
          way to go online; drivers only discovered the ONLINE requirement
          after being blocked by the "Cannot Start Trip" alert in
          handleStartTrip. This surfaces that same function proactively. */}
      <View style={styles.statusSection}>
        <View style={[styles.statusToggleContainer, { backgroundColor: colors.surface }]}>
          <View style={styles.statusInfo}>
            <Text style={[styles.statusLabel, { color: colors.textSecondary }]}>{t('quickDashboard.dutyStatus')}</Text>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor:
                      driverStatus === 'ONLINE' ? '#10B981' : driverStatus === 'DRIVING' ? '#F59E0B' : '#9CA3AF',
                  },
                ]}
              />
              <Text style={[styles.statusText, { color: colors.text }]}>
                {driverStatus === 'DRIVING' ? t('quickDashboard.statusDriving') : driverStatus === 'ONLINE' ? t('quickDashboard.statusOnline') : t('quickDashboard.statusOffline')}
              </Text>
            </View>
          </View>
          <View style={styles.switchContainer}>
            <Switch
              value={driverStatus === 'ONLINE' || driverStatus === 'DRIVING'}
              onValueChange={(value) => toggleDriverStatus(value)}
              disabled={driverStatus === 'DRIVING' || statusChanging || isLoading}
              trackColor={{ false: '#D1D5DB', true: colors.primary }}
              thumbColor="#FFFFFF"
            />
          </View>
        </View>
      </View>

      {showTripCompletedHint && (
        <View style={[styles.tripCompletedHintBanner, { backgroundColor: colors.primary }]}>
          <Text style={styles.tripCompletedHintText} numberOfLines={3}>
            {hasOwnerSession ? t('dutyDriver.tripCompletedHint') : t('dutyDriver.tripCompletedHintNoOwner')}
          </Text>
          <TouchableOpacity
            onPress={() => setShowTripCompletedHint(false)}
            style={styles.tripCompletedHintDismiss}
            accessibilityRole="button"
            accessibilityLabel="Dismiss"
          >
            <X color="#FFFFFF" size={16} />
          </TouchableOpacity>
        </View>
      )}

      {/* Main Tabs Header: Upcoming Trips (1st) vs Assigned Bookings (2nd) */}
      <View style={styles.tabContainer}>
        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'upcoming' && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab('upcoming')}
          activeOpacity={0.7}
        >
          <Clock size={16} color={activeTab === 'upcoming' ? '#D97706' : colors.textSecondary} />
          <Text style={[styles.tabText, { color: activeTab === 'upcoming' ? '#D97706' : colors.textSecondary }]}>
            {t('quickDashboard.upcomingTrips', { count: upcomingOrders.length })}
          </Text>
          <View style={[styles.tabBadge, { backgroundColor: activeTab === 'upcoming' ? '#F59E0B' : '#E5E7EB' }]}>
            <Text style={[styles.tabBadgeText, { color: activeTab === 'upcoming' ? '#FFFFFF' : '#4B5563' }]}>
              {upcomingOrders.length}
            </Text>
          </View>
        </TouchableOpacity>

        <TouchableOpacity
          style={[
            styles.tabButton,
            activeTab === 'assigned' && styles.tabButtonActive,
          ]}
          onPress={() => setActiveTab('assigned')}
          activeOpacity={0.7}
        >
          <Car size={16} color={activeTab === 'assigned' ? colors.primary : colors.textSecondary} />
          <Text style={[styles.tabText, { color: activeTab === 'assigned' ? colors.primary : colors.textSecondary }]}>
            {t('quickDashboard.assignedTrips', { count: driverOrders.length })}
          </Text>
          <View style={[styles.tabBadge, { backgroundColor: activeTab === 'assigned' ? colors.primary : '#E5E7EB' }]}>
            <Text style={[styles.tabBadgeText, { color: activeTab === 'assigned' ? '#FFFFFF' : '#4B5563' }]}>
              {driverOrders.length}
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {/* Orders Section */}
      <View style={styles.ordersSection}>
        <View style={styles.ordersHeader}>
          <Text style={[styles.ordersTitle, { color: colors.text }]}>
            {activeTab === 'upcoming' 
              ? t('quickDashboard.upcomingTrips', { count: upcomingOrders.length })
              : t('quickDashboard.assignedBookings', { count: driverOrders.length })}
          </Text>
          <View style={styles.headerButtons}>
          </View>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              {t('quickDashboard.loadingBookings')}
            </Text>
          </View>
        ) : (activeTab === 'upcoming' ? upcomingOrders : driverOrders).length === 0 ? (
          <EmptyState
            icon={activeTab === 'upcoming' ? Clock : Car}
            title={activeTab === 'upcoming' ? t('quickDashboard.noUpcomingBookingsTitle') : t('quickDashboard.noAssignedBookingsTitle')}
          />
        ) : (
          <ScrollView
            showsVerticalScrollIndicator={false}
            refreshControl={
              <FreshRefreshControl
                refreshing={refreshing}
                onRefresh={handleRefresh}
                colors={[colors.primary]}
                tintColor={colors.primary}
              />
            }
          >
            {(activeTab === 'upcoming' ? upcomingOrders : driverOrders).map((order, index) => {
              const isActiveTrip = !!activeTrip && activeTrip.order_id === order.order_id;
              const hasSomeActiveTrip = !!activeTrip;
              const isOtherOrderWhileActive = hasSomeActiveTrip && !isActiveTrip;

              return (
                <TouchableOpacity
                  key={`${order.order_id}-${index}`}
                  style={[
                    styles.orderCard,
                    { backgroundColor: colors.surface, opacity: isOtherOrderWhileActive ? 0.5 : 1 }
                  ]}
                  disabled={isOtherOrderWhileActive}
                  onPress={() => {
                    if (isOtherOrderWhileActive) return; // Block tap when another order is active
                    navigateToTrip(order);
                  }}
                >
                  {/* Upcoming Banner Highlight for Next 6h Tab */}
                  {activeTab === 'upcoming' && (
                    <View style={styles.upcomingTimeBanner}>
                      <Clock size={14} color="#B45309" />
                      <Text style={styles.upcomingTimeText}>
                        ⏰ Scheduled Pickup: {formatDateTime(order.scheduled_at || order.start_date_time).date} at {formatDateTime(order.scheduled_at || order.start_date_time).time}
                      </Text>
                    </View>
                  )}

                  <View style={styles.orderHeader}>
                    <View style={styles.orderInfo}>
                      <Text style={styles.orderId}>{t('quickDashboard.bookingPrefix', { id: formatBookingId(order.order_id ?? (order as any).id ?? (order as any).source_order_id) })}</Text>
                      <View style={styles.statusBadge}>
                        {getStatusIcon(order.assignment_status)}
                        <Text style={{ ...styles.statusText, color: getStatusColor(order.assignment_status) }}>{getBookingStatusLabel(order)}</Text>
                      </View>
                    </View>
                    <ArrowRight size={20} color={colors.textSecondary} />
                  </View>

                  <View style={styles.routeInfo}>
                    <View style={styles.locationRow}>
                      <View style={[styles.locationDot, { backgroundColor: '#10B981' }]} />
                      <Text style={[styles.locationText, { color: colors.text }]} numberOfLines={1}>{order.pickup}</Text>
                    </View>
                    {!String(order.trip_type || '').toLowerCase().includes('hour') && (
                      <View style={styles.locationRow}>
                        <View style={[styles.locationDot, { backgroundColor: '#EF4444' }]} />
                        <Text style={[styles.locationText, { color: colors.text }]} numberOfLines={1}>{order.drop}</Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.orderDetails}>
                    <View style={styles.detailRow}>
                      <User size={16} color={colors.textSecondary} />
                      <Text style={[styles.detailText, { color: colors.text }]}>{order.customer_name}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      {/* Driver taps to call the customer directly */}
                      {(order as any).customer_number_revealed === false && Number((order as any).customer_number_reveal_in_seconds) > 0 ? (
                        <CustomerNumberCountdown seconds={Number((order as any).customer_number_reveal_in_seconds)} onUnlock={loadDriverData} />
                      ) : (
                        <CallButton phoneNumber={order.customer_mobile} variant="inline" />
                      )}
                    </View>

                    {/* Vendor Information */}
                    {order.vendor_name && (
                      <View style={styles.detailRow}>
                        <User size={16} color={colors.primary} />
                        <Text style={[styles.detailText, { color: colors.primary }]}>{t('quickDashboard.vendorPrefix', { name: order.vendor_name })}</Text>
                      </View>
                    )}
                    
                    {order.vendor_primary_number && (
                      <View style={styles.detailRow}>
                        {/* Before trip start the driver can reach the vendor too - tappable. */}
                        <CallButton phoneNumber={order.vendor_primary_number} label={t('quickDashboard.vendorLabel')} variant="inline" />
                      </View>
                    )}

                    {order.vendor_secondary_number && order.vendor_secondary_number !== order.vendor_primary_number && (
                      <View style={styles.detailRow}>
                        <CallButton phoneNumber={order.vendor_secondary_number} label={t('quickDashboard.vendorAltLabel')} variant="inline" />
                      </View>
                    )}
                    <View style={styles.detailRow}>
                      <Car size={16} color={colors.textSecondary} />
                      <Text style={[styles.detailText, { color: colors.text }]}>{formatCarType(order.car_type)} • {order.trip_type}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Clock size={16} color={colors.textSecondary} />
                      <Text style={[styles.detailText, { color: colors.text }]}>{formatDateTime(order.scheduled_at || order.start_date_time).date} at {formatDateTime(order.scheduled_at || order.start_date_time).time}</Text>
                    </View>
                    {order.waiting_time !== undefined && order.waiting_time !== null && (
                      <View style={styles.detailRow}>
                        <IndianRupee size={16} color={colors.textSecondary} />
                        <Text style={[styles.detailText, { color: colors.text }]}>{t('quickDashboard.waitingChargeAmount', { amount: order.waiting_time })}</Text>
                      </View>
                    )}
                    {order.waiting_charge !== undefined && order.waiting_charge !== null && (
                      <View style={styles.detailRow}>
                        <IndianRupee size={16} color={colors.textSecondary} />
                        <Text style={[styles.detailText, { color: colors.text }]}>{t('quickDashboard.waitingChargeAmount', { amount: order.waiting_charge })}</Text>
                      </View>
                    )}
                    {order.night_charges !== undefined && order.night_charges !== null && (
                      <View style={styles.detailRow}>
                        <Moon size={16} color={colors.textSecondary} />
                        <Text style={[styles.detailText, { color: colors.text }]}>{t('quickDashboard.nightChargesAmount', { amount: order.night_charges })}</Text>
                      </View>
                    )}
                    {/* Pickup Notes */}
                    {order.pickup_notes && order.pickup_notes !== 'NILL' && order.pickup_notes !== 'null' && (
                      <View style={styles.detailRow}>
                        <FileText size={16} color="#EF4444" />
                        <Text style={[styles.detailText, { color: '#EF4444' }]}>{t('quickDashboard.pickupNotesAmount', { notes: order.pickup_notes })}</Text>
                      </View>
                    )}
                  </View>

                  {/* Fare: the booking's total (what the customer pays) with what it INCLUDES and what is charged on actuals.
                      The driver's own rates / commission are never shown here. */}
                  <TouchableOpacity
                    style={[styles.seeMoreButton, { backgroundColor: colors.background, borderColor: colors.border }]}
                    onPress={() => setExpandedOrderId(expandedOrderId === order.order_id ? null : order.order_id)}
                  >
                    <Text style={[styles.seeMoreText, { color: colors.primary }]}>
                      {expandedOrderId === order.order_id ? 'Hide fare details' : 'Fare details'}
                    </Text>
                  </TouchableOpacity>
                  {expandedOrderId === order.order_id && (() => {
                    const items = Array.isArray(order.charge_items) ? order.charge_items : [];
                    const included = items.filter((c) => c && c.included !== false);
                    const excluded = items.filter((c) => c && c.included === false);
                    const total = Number((order as any).closed_vendor_price ?? (order as any).vendor_price ?? (order as any).total_fare ?? 0);
                    return (
                      <View style={[styles.expandedDetails, { borderTopColor: colors.border }]}>
                        <View style={styles.expandedRow}>
                          <Text style={[styles.expandedLabel, { color: colors.textSecondary }]}>Trip fare</Text>
                          <Text style={[styles.expandedValue, { color: colors.text, fontFamily: 'Inter-Bold' }]}>₹{total}</Text>
                        </View>
                        {included.length > 0 && (
                          <>
                            <Text style={{ marginTop: 10, marginBottom: 6, fontSize: 12.5, fontFamily: 'Inter-Bold', color: '#059669' }}>Included in the fare</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                              {included.map((c, i) => (
                                <View key={`i${i}`} style={{ backgroundColor: '#D1FAE5', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
                                  <Text style={{ color: '#065F46', fontSize: 12, fontFamily: 'Inter-Medium' }}>✓ {c.label}</Text>
                                </View>
                              ))}
                            </View>
                          </>
                        )}
                        {excluded.length > 0 && (
                          <>
                            <Text style={{ marginTop: 10, marginBottom: 6, fontSize: 12.5, fontFamily: 'Inter-Bold', color: '#B45309' }}>Not in the fare - charged on actuals</Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                              {excluded.map((c, i) => (
                                <View key={`e${i}`} style={{ backgroundColor: '#FEF3C7', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 }}>
                                  <Text style={{ color: '#92400E', fontSize: 12, fontFamily: 'Inter-Medium' }}>+ {c.label}</Text>
                                </View>
                              ))}
                            </View>
                          </>
                        )}
                        {items.length === 0 && (
                          <Text style={{ color: colors.textSecondary, fontSize: 12.5, marginTop: 8 }}>
                            Toll, parking, permit and waiting are charged on actuals unless the booking says they are included.
                          </Text>
                        )}
                      </View>
                    );
                  })()}

                  <View style={styles.orderFooter}>
                    {/* Show start/end buttons based on trip state */}
                    {(activeTrip && activeTrip.order_id === order.order_id) || order.assignment_status === 'DRIVING' ? (
                      <TouchableOpacity 
                        style={[styles.endTripButton, { backgroundColor: '#EF4444' }]}
                        onPress={() => handleEndTrip(order)}
                        disabled={tripActionLoading === order.order_id}
                      >
                        {tripActionLoading === order.order_id ? (
                          <ActivityIndicator size="small" color="white" />
                        ) : (
                          <>
                            <CheckCircle size={16} color="white" />
                            <Text style={styles.endTripText}>{t('quickDashboard.endTrip')}</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    ) : activeTrip ? (
                      <TouchableOpacity
                        style={[styles.startTripButton, { backgroundColor: '#9CA3AF' }]}
                        disabled={true}
                      >
                        <AlertCircle size={16} color="white" />
                        <Text style={styles.startTripText}>{t('quickDashboard.tripActive')}</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        style={[styles.startTripButton, { backgroundColor: colors.primary }]}
                        onPress={() => handleStartTrip(order)}
                        disabled={tripActionLoading === order.order_id}
                      >
                        {tripActionLoading === order.order_id ? (
                          <ActivityIndicator size="small" color="white" />
                        ) : (
                          <>
                            <Navigation size={16} color="white" />
                            <Text style={styles.startTripText}>{t('quickDashboard.startTrip')}</Text>
                          </>
                        )}
                      </TouchableOpacity>
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        )}
      </View>

      {/* History Button at Bottom */}
      {!embedded && (
      <View style={{ paddingHorizontal: 20, marginTop: 18, marginBottom: 6 }}>
        <TouchableOpacity 
          onPress={() => { setHistoryVisible(true); fetchOrderHistory(); }} 
          style={{
            backgroundColor: colors.primary, 
            borderRadius: 12, 
            paddingVertical: 14, 
            alignItems: 'center', 
            flexDirection: 'row', 
            justifyContent: 'center',
            elevation: 3,
            shadowColor: colors.primary,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.2,
            shadowRadius: 4
          }}
          activeOpacity={0.85}
        >
          <Clock color="#fff" size={20} style={{ marginRight: 8 }} />
          <Text style={{ color: 'white', fontSize: 16, fontFamily: 'Inter-Bold' }}>
            {t('quickDashboard.history')}
          </Text>
        </TouchableOpacity>
      </View>
      )}

      {/* ENHANCED HISTORY MODAL (Savaari Driver App Style) */}
      <Modal
        visible={historyVisible}
        animationType="slide"
        onRequestClose={() => setHistoryVisible(false)}
        transparent
      >
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }}>
          <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '90%', flex: 1 }}>
            
            {/* Modal Header */}
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Clock color={colors.primary} size={22} />
                <Text style={{ fontSize: 20, fontFamily: 'Inter-Bold', color: colors.text }}>
                  {t('quickDashboard.completedTrips')}
                </Text>
              </View>
              <TouchableOpacity 
                onPress={() => setHistoryVisible(false)}
                style={{ padding: 6, backgroundColor: '#F3F4F6', borderRadius: 10 }}
              >
                <X color={colors.textSecondary} size={20} />
              </TouchableOpacity>
            </View>

            {/* Summary Stats Cards */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <View style={{ flex: 1, backgroundColor: '#EFF6FF', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#BFDBFE' }}>
                <Text style={{ fontSize: 12, color: '#1E40AF', fontFamily: 'Inter-Medium' }}>
                  {t('quickDashboard.totalTripsCount', { defaultValue: 'Completed Trips' })}
                </Text>
                <Text style={{ fontSize: 20, color: '#1E3A8A', fontFamily: 'Inter-Bold', marginTop: 4 }}>
                  {filteredOrderHistory.length}
                </Text>
              </View>
              <View style={{ flex: 1, backgroundColor: '#ECFDF5', borderRadius: 8, padding: 12, borderWidth: 1, borderColor: '#A7F3D0' }}>
                <Text style={{ fontSize: 12, color: '#065F46', fontFamily: 'Inter-Medium' }}>
                  {t('quickDashboard.totalEarningsLabel', { defaultValue: 'Total Cash Collected' })}
                </Text>
                <Text style={{ fontSize: 20, color: '#064E3B', fontFamily: 'Inter-Bold', marginTop: 4 }}>
                  ₹{totalCashCollected.toLocaleString()}
                </Text>
              </View>
            </View>

            {/* Search Input Bar */}
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 6, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 12 }}>
              <Search color="#9CA3AF" size={18} style={{ marginRight: 8 }} />
              <TextInput
                style={{ flex: 1, fontSize: 14, color: colors.text, paddingVertical: 2 }}
                placeholder={t('quickDashboard.historySearchPlaceholder', { defaultValue: 'Search ID, customer, location...' })}
                placeholderTextColor="#9CA3AF"
                value={historySearch}
                onChangeText={setHistorySearch}
              />
              {historySearch.length > 0 && (
                <TouchableOpacity onPress={() => setHistorySearch('')}>
                  <X color="#9CA3AF" size={16} />
                </TouchableOpacity>
              )}
            </View>

            {/* Filter Pills */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
              {[
                { key: 'all', label: t('quickDashboard.filterAll', { defaultValue: 'All' }) },
                { key: 'today', label: t('quickDashboard.filterToday', { defaultValue: 'Today' }) },
                { key: 'this_week', label: t('quickDashboard.filterThisWeek', { defaultValue: 'This Week' }) },
              ].map((chip) => (
                <TouchableOpacity
                  key={chip.key}
                  onPress={() => setHistoryTimeFilter(chip.key as any)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: 10,
                    backgroundColor: historyTimeFilter === chip.key ? colors.primary : '#F3F4F6',
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontFamily: 'Inter-Medium',
                      color: historyTimeFilter === chip.key ? '#FFFFFF' : '#4B5563',
                    }}
                  >
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* History List */}
            {historyLoading ? (
              <ActivityIndicator color={colors.primary} size="large" style={{ marginVertical: 40 }} />
            ) : historyError ? (
              <Text style={{ color: colors.error, textAlign: 'center', marginVertical: 30 }}>{historyError}</Text>
            ) : filteredOrderHistory.length === 0 ? (
              <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
                <Car size={40} color="#D1D5DB" />
                <Text style={{ textAlign: 'center', color: colors.textSecondary, marginTop: 12, fontSize: 14 }}>
                  {t('quickDashboard.noCompletedTripsFound')}
                </Text>
              </View>
            ) : (
              <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                {filteredOrderHistory.map((order: any, idx: number) => {
                  const pickup = (order.pickup_drop_location && order.pickup_drop_location['0']) || order.pickup || '-';
                  const drop = (order.pickup_drop_location && order.pickup_drop_location['1']) || order.drop || '-';
                  const bookingIdDisplay = formatBookingId((order as any).id ?? order.order_id ?? (order as any).source_order_id);

                  return (
                    <TouchableOpacity
                      key={(order as any).id || order.order_id || idx}
                      onPress={() => setSelectedHistoryOrder(order)}
                      activeOpacity={0.7}
                      style={{
                        borderWidth: 1,
                        borderRadius: 16,
                        borderColor: '#E5E7EB',
                        backgroundColor: '#FFFFFF',
                        marginBottom: 12,
                        padding: 14,
                        elevation: 1,
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.05,
                        shadowRadius: 2,
                      }}
                    >
                      {/* Top Header of Card */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#F3F4F6', paddingBottom: 10, marginBottom: 10 }}>
                        <View style={{ flexShrink: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginRight: 8 }}>
                          <Text style={{ fontFamily: 'Inter-Bold', fontSize: 15, color: colors.primary }}>
                            {t('quickDashboard.bookingPrefix', { id: bookingIdDisplay })}
                          </Text>
                          <View style={{ backgroundColor: '#DEF7EC', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                            <Text style={{ color: '#03543F', fontSize: 11, fontFamily: 'Inter-SemiBold' }}>Completed</Text>
                          </View>
                        </View>
                        <Text style={{ color: '#059669', fontSize: 16, fontFamily: 'Inter-Bold' }}>
                          ₹{order.closed_vendor_price || 0}
                        </Text>
                      </View>

                      {/* Customer & Vendor Snippet */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
                        <View style={{ flex: 1, paddingRight: 6 }}>
                          <Text style={{ fontSize: 12, color: colors.textSecondary }}>Customer</Text>
                          <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text }} numberOfLines={1}>
                            {order.customer_name || 'Customer'}
                          </Text>
                        </View>
                        {order.vendor_name && (
                          <View style={{ flex: 1, paddingLeft: 6, alignItems: 'flex-end' }}>
                            <Text style={{ fontSize: 12, color: colors.textSecondary }}>Vendor</Text>
                            <Text style={{ fontSize: 13, fontFamily: 'Inter-Medium', color: colors.text }} numberOfLines={1}>
                              {order.vendor_name}
                            </Text>
                          </View>
                        )}
                      </View>

                      {/* Route Preview */}
                      <View style={{ backgroundColor: '#F9FAFB', padding: 10, borderRadius: 6, marginBottom: 10 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
                          <Text style={{ fontSize: 13, color: colors.text, flex: 1 }} numberOfLines={1}>{pickup}</Text>
                        </View>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#EF4444' }} />
                          <Text style={{ fontSize: 13, color: colors.text, flex: 1 }} numberOfLines={1}>{drop}</Text>
                        </View>
                      </View>

                      {/* Bottom Footer Action */}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: colors.textSecondary }}>
                          {order.start_date_time ? new Date(order.start_date_time).toLocaleDateString() : ''}
                        </Text>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                          <Text style={{ color: colors.primary, fontSize: 13, fontFamily: 'Inter-SemiBold' }}>View Details</Text>
                          <ChevronRight size={16} color={colors.primary} />
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* COMPREHENSIVE COMPLETED TRIP DETAIL MODAL */}
      <Modal
        visible={!!selectedHistoryOrder}
        animationType="slide"
        onRequestClose={() => setSelectedHistoryOrder(null)}
        transparent
      >
        {selectedHistoryOrder && (
          <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' }}>
            <View style={{ backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '92%', flex: 1 }}>
              
              {/* Header */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', paddingBottom: 12, marginBottom: 14 }}>
                <View>
                  <Text style={{ fontSize: 18, fontFamily: 'Inter-Bold', color: colors.text }}>
                    {t('quickDashboard.bookingPrefix', { id: formatBookingId(selectedHistoryOrder.order_id ?? selectedHistoryOrder.id) })}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.textSecondary, marginTop: 2 }}>
                    Completed on {selectedHistoryOrder.start_date_time ? new Date(selectedHistoryOrder.start_date_time).toLocaleString() : '-'}
                  </Text>
                </View>
                <TouchableOpacity 
                  onPress={() => setSelectedHistoryOrder(null)}
                  style={{ padding: 6, backgroundColor: '#F3F4F6', borderRadius: 10 }}
                >
                  <X color={colors.textSecondary} size={20} />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false}>
                
                {/* Cash Collected Highlight Banner */}
                <View style={{ backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0', borderRadius: 8, padding: 14, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                  <View>
                    <Text style={{ fontSize: 12, color: '#065F46', fontFamily: 'Inter-Medium' }}>Total Cash Collected</Text>
                    <Text style={{ fontSize: 24, color: '#047857', fontFamily: 'Inter-Bold', marginTop: 2 }}>
                      ₹{selectedHistoryOrder.closed_vendor_price || 0}
                    </Text>
                  </View>
                  <View style={{ backgroundColor: '#10B981', width: 42, height: 42, borderRadius: 21, alignItems: 'center', justifyContent: 'center' }}>
                    <IndianRupee color="#FFFFFF" size={22} />
                  </View>
                </View>

                {/* Customer Section */}
                <View style={{ backgroundColor: colors.surface, borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 14 }}>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter-Bold', color: colors.text, marginBottom: 8 }}>
                    {t('quickDashboard.customerDetails', { defaultValue: 'Customer Details' })}
                  </Text>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                    <View>
                      <Text style={{ fontSize: 15, fontFamily: 'Inter-SemiBold', color: colors.text }}>
                        {selectedHistoryOrder.customer_name || 'Customer'}
                      </Text>
                      <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                        {selectedHistoryOrder.customer_number || selectedHistoryOrder.customer_mobile || 'No number'}
                      </Text>
                    </View>
                    {(selectedHistoryOrder.customer_number || selectedHistoryOrder.customer_mobile) && (
                      <CallButton phoneNumber={selectedHistoryOrder.customer_number || selectedHistoryOrder.customer_mobile} variant="inline" />
                    )}
                  </View>
                </View>

                {/* Vendor Section */}
                {selectedHistoryOrder.vendor_name && (
                  <View style={{ backgroundColor: colors.surface, borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 14 }}>
                    <Text style={{ fontSize: 14, fontFamily: 'Inter-Bold', color: colors.text, marginBottom: 8 }}>
                      {t('quickDashboard.vendorDetails', { defaultValue: 'Vendor Details' })}
                    </Text>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                      <View>
                        <Text style={{ fontSize: 15, fontFamily: 'Inter-SemiBold', color: colors.primary }}>
                          {selectedHistoryOrder.vendor_name}
                        </Text>
                        <Text style={{ fontSize: 13, color: colors.textSecondary, marginTop: 2 }}>
                          {selectedHistoryOrder.vendor_primary_number || '-'}
                        </Text>
                      </View>
                      {selectedHistoryOrder.vendor_primary_number && (
                        <CallButton phoneNumber={selectedHistoryOrder.vendor_primary_number} variant="inline" label="Call Vendor" />
                      )}
                    </View>
                  </View>
                )}

                {/* Route & Trip Details */}
                <View style={{ backgroundColor: colors.surface, borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 14 }}>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter-Bold', color: colors.text, marginBottom: 10 }}>
                    {t('quickDashboard.routeDetails', { defaultValue: 'Route Details' })}
                  </Text>
                  
                  <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
                    <MapPin color="#10B981" size={18} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>Pickup Location</Text>
                      <Text style={{ fontSize: 14, color: colors.text, fontFamily: 'Inter-Medium' }}>
                        {(selectedHistoryOrder.pickup_drop_location && selectedHistoryOrder.pickup_drop_location['0']) || selectedHistoryOrder.pickup || '-'}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <MapPin color="#EF4444" size={18} style={{ marginTop: 2 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>Drop Location</Text>
                      <Text style={{ fontSize: 14, color: colors.text, fontFamily: 'Inter-Medium' }}>
                        {(selectedHistoryOrder.pickup_drop_location && selectedHistoryOrder.pickup_drop_location['1']) || selectedHistoryOrder.drop || '-'}
                      </Text>
                    </View>
                  </View>

                  {selectedHistoryOrder.trip_distance && (
                    <View style={{ borderTopWidth: 1, borderTopColor: '#F3F4F6', marginTop: 10, paddingTop: 10, flexDirection: 'row', justifyContent: 'space-between' }}>
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>Distance</Text>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text }}>{selectedHistoryOrder.trip_distance} KM</Text>
                    </View>
                  )}
                  {selectedHistoryOrder.trip_time && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>Duration</Text>
                      <Text style={{ fontSize: 13, fontFamily: 'Inter-SemiBold', color: colors.text }}>{selectedHistoryOrder.trip_time}</Text>
                    </View>
                  )}
                </View>

                {/* Fare Breakdown */}
                <View style={{ backgroundColor: colors.surface, borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#E5E7EB', marginBottom: 14 }}>
                  <Text style={{ fontSize: 14, fontFamily: 'Inter-Bold', color: colors.text, marginBottom: 10 }}>
                    {t('quickDashboard.fareDetails', { defaultValue: 'Fare Breakdown' })}
                  </Text>
                  
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>Price per KM</Text>
                    <Text style={{ fontSize: 13, color: colors.text }}>₹{selectedHistoryOrder.cost_per_km || 0}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>Driver Beta / Allowance</Text>
                    <Text style={{ fontSize: 13, color: colors.text }}>₹{selectedHistoryOrder.driver_allowance || 0}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>Permit Charges</Text>
                    <Text style={{ fontSize: 13, color: colors.text }}>₹{selectedHistoryOrder.permit_charges || 0}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>Hill Charges</Text>
                    <Text style={{ fontSize: 13, color: colors.text }}>₹{selectedHistoryOrder.hill_charges || 0}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                    <Text style={{ fontSize: 13, color: colors.textSecondary }}>Toll Charges</Text>
                    <Text style={{ fontSize: 13, color: colors.text }}>₹{selectedHistoryOrder.toll_charges || 0}</Text>
                  </View>
                  {selectedHistoryOrder.night_charges !== undefined && selectedHistoryOrder.night_charges !== null && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>Night Charges</Text>
                      <Text style={{ fontSize: 13, color: colors.text }}>₹{selectedHistoryOrder.night_charges}</Text>
                    </View>
                  )}
                  {selectedHistoryOrder.waiting_charge !== undefined && selectedHistoryOrder.waiting_charge !== null && (
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                      <Text style={{ fontSize: 13, color: colors.textSecondary }}>Waiting Charge</Text>
                      <Text style={{ fontSize: 13, color: colors.text }}>₹{selectedHistoryOrder.waiting_charge}</Text>
                    </View>
                  )}

                  <View style={{ borderTopWidth: 1, borderTopColor: '#E5E7EB', paddingTop: 8, marginTop: 4, flexDirection: 'row', justifyContent: 'space-between' }}>
                    <Text style={{ fontSize: 15, fontFamily: 'Inter-Bold', color: colors.text }}>Total Cash Collected</Text>
                    <Text style={{ fontSize: 16, fontFamily: 'Inter-Bold', color: '#10B981' }}>
                      ₹{selectedHistoryOrder.closed_vendor_price || 0}
                    </Text>
                  </View>
                </View>

                {/* Pickup Notes */}
                {selectedHistoryOrder.pickup_notes && selectedHistoryOrder.pickup_notes !== 'NILL' && selectedHistoryOrder.pickup_notes !== 'null' && (
                  <View style={{ backgroundColor: '#FEF2F2', borderRadius: 8, padding: 14, borderWidth: 1, borderColor: '#FCA5A5', marginBottom: 14 }}>
                    <Text style={{ fontSize: 13, fontFamily: 'Inter-Bold', color: '#991B1B', marginBottom: 4 }}>
                      Pickup Notes
                    </Text>
                    <Text style={{ fontSize: 13, color: '#991B1B' }}>
                      {selectedHistoryOrder.pickup_notes}
                    </Text>
                  </View>
                )}

              </ScrollView>

              <TouchableOpacity
                onPress={() => setSelectedHistoryOrder(null)}
                style={{ backgroundColor: colors.primary, borderRadius: 6, paddingVertical: 12, alignItems: 'center', marginTop: 10 }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 15, fontFamily: 'Inter-Bold' }}>Close Details</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      paddingHorizontal: 20,
    paddingVertical: 16,
      borderBottomWidth: 1,
    borderBottomColor: '#E5E7EB',
  },
  headerContent: {
      flexDirection: 'row',
      alignItems: 'center',
    justifyContent: 'space-between',
    },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  tripCompletedHintBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 6,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginHorizontal: 20,
    marginTop: 12,
    gap: 8,
  },
  tripCompletedHintText: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },
  tripCompletedHintDismiss: {
    padding: 4,
  },
  notificationToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    padding: 4,
  },
  switch: {
    transform: [{ scaleX: 0.8 }, { scaleY: 0.8 }],
  },
  driverInfo: {
    flexDirection: 'row',
    alignItems: 'center',
      flex: 1,
    },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#F3F4F6',
      alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    },
  driverDetails: {
      flex: 1,
    },
  driverName: {
      fontSize: 18,
    fontWeight: '600',
    marginBottom: 2,
    },
  driverPhone: {
      fontSize: 14,
  },
  logoutButton: {
    padding: 8,
  },
  statusSection: {
    padding: 20,
    alignItems: 'center',
  },
  statusToggleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    marginBottom: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusInfo: {
    flex: 1,
  },
  statusLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 4,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    fontSize: 16,
    flexShrink: 1,
    fontWeight: '600',
  },
  switchContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 50,
  },
  statusDescription: {
    fontSize: 14,
    textAlign: 'center',
  },
  activeTripIndicator: {
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    borderWidth: 1,
  },
  activeTripText: {
    fontSize: 12,
    fontWeight: '600',
    textAlign: 'center',
  },
  ordersSection: {
    flex: 1,
    paddingHorizontal: 20,
  },
  ordersHeader: {
    flexDirection: 'row',
      alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  ordersTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  headerButtons: {
      flexDirection: 'row',
      alignItems: 'center',
    gap: 8,
  },
  debugButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  },
  debugButtonText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
      alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    },
  loadingText: {
    marginTop: 12,
      fontSize: 16,
  },
  orderCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  disabledOrderCard: {
    opacity: 0.5,
    backgroundColor: '#F3F4F6',
  },
    orderHeader: {
      flexDirection: 'row',
    alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    orderInfo: {
      flex: 1,
    },
  orderId: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  routeInfo: {
    marginBottom: 12,
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  locationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  locationText: {
      fontSize: 14,
    flex: 1,
    },
    orderDetails: {
    marginBottom: 12,
    },
    seeMoreButton: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 8,
      borderRadius: 6,
      borderWidth: 1,
      marginBottom: 12,
    },
    seeMoreText: {
      fontSize: 13,
      fontFamily: 'Inter-SemiBold',
    },
    expandedDetails: {
      borderTopWidth: 1,
      paddingTop: 8,
      marginBottom: 12,
    },
    expandedRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    expandedLabel: {
      fontSize: 13,
    },
    expandedValue: {
      fontSize: 13,
      fontFamily: 'Inter-SemiBold',
    },
    detailRow: {
      flexDirection: 'row',
      alignItems: 'center',
    marginBottom: 4,
    },
    detailText: {
      flex: 1,
      fontSize: 14,
    marginLeft: 8,
    },
  orderFooter: {
      flexDirection: 'row',
      alignItems: 'center',
    justifyContent: 'space-between',
  },
  fareContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  fareAmount: {
    fontSize: 18,
    fontWeight: '600',
    color: '#10B981',
    marginLeft: 4,
  },
  startTripButton: {
    flexDirection: 'row',
    alignItems: 'center',
      paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    },
  startTripText: {
    color: 'white',
      fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
  },
  endTripButton: {
    flexDirection: 'row',
      alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  endTripText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 4,
    },
  tollIndicator: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    marginTop: 4,
  },
  tollText: {
    fontSize: 12,
    fontWeight: '500',
  },
  tabContainer: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 4,
    backgroundColor: '#F3F4F6',
    borderRadius: 6,
    padding: 2,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 5.5,
    paddingHorizontal: 6,
    borderRadius: 6,
    gap: 5,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  tabText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
  },
  tabBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    minWidth: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabBadgeText: {
    fontSize: 11,
    fontFamily: 'Inter-Bold',
  },
  upcomingTimeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 6,
    marginBottom: 12,
  },
  upcomingTimeText: {
    color: '#92400E',
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    flex: 1,
  },
});

