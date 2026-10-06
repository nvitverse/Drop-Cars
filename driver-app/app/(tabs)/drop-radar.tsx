import FreshRefreshControl from '@/components/FreshRefreshControl';
import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Animated,
  Easing,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useTheme } from '@/contexts/ThemeContext';
import { useLanguage } from '@/contexts/LanguageContext';
import { useCarDriver } from '@/contexts/CarDriverContext';
import DropMarketSwitcher from '@/components/DropMarketSwitcher';
import {
  Power,
  Radio,
  MapPin,
  Navigation,
  Compass,
  Sparkles,
  Zap,
} from 'lucide-react-native';

function LiveRadarView({
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
      <View
        style={{
          backgroundColor: colors.surface,
          borderRadius: 16,
          padding: 28,
          alignItems: 'center',
          marginHorizontal: 16,
          marginTop: 20,
          borderWidth: 1,
          borderColor: colors.border,
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.05,
          shadowRadius: 8,
          elevation: 2,
        }}
      >
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 36,
            backgroundColor: isDarkMode ? '#1F2937' : '#FEE2E2',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: 16,
          }}
        >
          <Power color="#EF4444" size={32} />
        </View>

        <View
          style={{
            backgroundColor: isDarkMode ? '#374151' : '#F3F4F6',
            paddingHorizontal: 12,
            paddingVertical: 4,
            borderRadius: 6,
            marginBottom: 12,
          }}
        >
          <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', color: colors.textSecondary }}>
            🔴 RADAR DISPATCH OFFLINE
          </Text>
        </View>

        <Text
          style={{
            fontSize: 18,
            fontFamily: 'Inter-Bold',
            color: colors.text,
            textAlign: 'center',
            marginBottom: 8,
          }}
        >
          Go Online for Live Bookings
        </Text>
        <Text
          style={{
            fontSize: 13,
            fontFamily: 'Inter-Medium',
            color: colors.textSecondary,
            textAlign: 'center',
            lineHeight: 19,
            marginBottom: 24,
            maxWidth: 300,
          }}
        >
          Turn on live radar scanning to receive instant 1-tap local customer ride matches in your area.
        </Text>

        <TouchableOpacity
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            backgroundColor: '#10B981',
            paddingVertical: 14,
            paddingHorizontal: 32,
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
                Activate Live Radar
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
      transform: [
        {
          scale: anim.interpolate({
            inputRange: [0, 1],
            outputRange: [0.6, 2.2],
          }),
        },
      ],
      opacity: anim.interpolate({
        inputRange: [0, 0.2, 0.8, 1],
        outputRange: [0.7, 0.5, 0.2, 0],
      }),
    };
  };

  return (
    <View
      style={{
        backgroundColor: colors.surface,
        borderRadius: 16,
        padding: 24,
        alignItems: 'center',
        marginHorizontal: 16,
        marginTop: 16,
        marginBottom: 18,
        borderWidth: 1,
        borderColor: colors.border,
        overflow: 'hidden',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
      }}
    >
      {/* Top Status Pill */}
      <View
        style={{
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
        }}
      >
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: '#10B981' }} />
        <Text style={{ fontSize: 11.5, fontFamily: 'Inter-Bold', color: '#059669', letterSpacing: 0.3 }}>
          LIVE RADAR SEARCHING
        </Text>
      </View>

      {/* Futuristic Animated Radar View */}
      <View
        style={{
          width: 220,
          height: 220,
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 20,
        }}
      >
        {/* Pulse Waves */}
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 100,
              height: 100,
              borderRadius: 50,
              borderWidth: 2,
              borderColor: '#10B981',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
            },
            getRingStyle(pulse1),
          ]}
        />

        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 100,
              height: 100,
              borderRadius: 50,
              borderWidth: 2,
              borderColor: '#10B981',
              backgroundColor: 'rgba(16, 185, 129, 0.10)',
            },
            getRingStyle(pulse2),
          ]}
        />

        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 100,
              height: 100,
              borderRadius: 50,
              borderWidth: 2,
              borderColor: '#10B981',
              backgroundColor: 'rgba(16, 185, 129, 0.05)',
            },
            getRingStyle(pulse3),
          ]}
        />

        {/* Rotating Scanner Line / Sweep */}
        <Animated.View
          style={{
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
          }}
        >
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981', marginTop: 3 }} />
        </Animated.View>

        {/* Outer Circular Bounds */}
        <View
          style={{
            position: 'absolute',
            width: 150,
            height: 150,
            borderRadius: 75,
            borderWidth: 1,
            borderColor: isDarkMode ? '#05966930' : '#D1FAE5',
          }}
        />

        {/* Center Glowing Hub */}
        <View
          style={{
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
          }}
        >
          <Navigation color="#FFFFFF" size={26} />
        </View>
      </View>

      {/* Status Heading & Details */}
      <Text style={{ fontSize: 17, fontFamily: 'Inter-Bold', color: colors.text, textAlign: 'center', marginBottom: 6 }}>
        Searching for Local Bookings...
      </Text>
      <Text
        style={{
          fontSize: 12.5,
          fontFamily: 'Inter-Medium',
          color: colors.textSecondary,
          textAlign: 'center',
          lineHeight: 18,
          marginBottom: 18,
          maxWidth: 320,
        }}
      >
        Scanning customer pickup points near your live location. When a local ride matches, an alert will sound with instant 1-tap accept.
      </Text>

      {/* Real-time Status Chips */}
      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          justifyContent: 'center',
          gap: 8,
          marginBottom: 16,
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            backgroundColor: isDarkMode ? '#1E293B' : '#F1F5F9',
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: isDarkMode ? '#334155' : '#E2E8F0',
          }}
        >
          <MapPin color={colors.primary} size={13} />
          <Text style={{ flexShrink: 1, fontSize: 11.5, fontFamily: 'Inter-SemiBold', color: colors.text }}>
            {driverLocation}
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            backgroundColor: isDarkMode ? '#1E293B' : '#F1F5F9',
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: isDarkMode ? '#334155' : '#E2E8F0',
          }}
        >
          <Radio color="#10B981" size={13} />
          <Text style={{ fontSize: 11.5, fontFamily: 'Inter-SemiBold', color: colors.text }}>
            Radar Radius: 15 KM
          </Text>
        </View>

        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            backgroundColor: isDarkMode ? '#1E293B' : '#F1F5F9',
            paddingHorizontal: 10,
            paddingVertical: 6,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: isDarkMode ? '#334155' : '#E2E8F0',
          }}
        >
          <Sparkles color="#F59E0B" size={13} />
          <Text style={{ fontSize: 11.5, fontFamily: 'Inter-SemiBold', color: colors.text }}>
            Local Dispatch: Active
          </Text>
        </View>
      </View>

      {/* Info Notice Box */}
      <View
        style={{
          backgroundColor: isDarkMode ? '#111827' : '#EFF6FF',
          borderRadius: 10,
          padding: 12,
          borderWidth: 1,
          borderColor: isDarkMode ? '#1F2937' : '#BFDBFE',
          flexDirection: 'row',
          alignItems: 'flex-start',
          gap: 8,
          width: '100%',
        }}
      >
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

export default function DropRadarScreen() {
  const { colors, isDarkMode } = useTheme();
  const { driver, goOnline, goOffline, clearError } = useCarDriver();
  const [refreshing, setRefreshing] = useState(false);
  const [statusLoading, setStatusLoading] = useState(false);

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
        setIsOnlineState(false);
        await goOffline();
      } else {
        setIsOnlineState(true);
        await goOnline();
      }
    } catch (error: any) {
      setIsOnlineState(!isOnlineState);
      Alert.alert('Status Update', error.message || 'Could not change status. Please try again.');
    } finally {
      setStatusLoading(false);
    }
  };

  const driverLocation = (driver as any)?.city ? `${(driver as any).city}, TN` : (driver?.address || 'Padappai, TN');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]} edges={['top']}>
      <DropMarketSwitcher active="radar" />
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 30 }}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <FreshRefreshControl
            refreshing={refreshing}
            onRefresh={async () => {
              setRefreshing(true);
              setTimeout(() => setRefreshing(false), 800);
            }}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
      >
        <LiveRadarView
          isOnline={isOnlineState}
          driverLocation={driverLocation}
          colors={colors}
          isDarkMode={isDarkMode}
          onGoOnline={handleStatusToggle}
          statusLoading={statusLoading}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
