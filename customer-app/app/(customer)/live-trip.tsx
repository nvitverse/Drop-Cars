import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  StatusBar,
  Platform,
  Share,
  Linking,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useScreenTheme } from '@/components/SafeArea';
import { getPalette, ThemePalette } from '@/constants/theme';
import axiosInstance from '@/app/api/axiosInstance';
import { ArrowLeft, MapPin, Share2, Navigation2, RefreshCw } from 'lucide-react-native';
import LiveTripMap from '@/components/LiveTripMap';

interface LiveLocation {
  has_assignment: boolean;
  assignment_status?: string;
  last_lat: number | null;
  last_lng: number | null;
  last_location_at: string | null;
  tracking_left: boolean | null;
}

const POLL_INTERVAL_MS = 12000;

export default function LiveTripScreen() {
  const router = useRouter();
  const { isDark, topPadding } = useScreenTheme();
  const palette = getPalette(isDark);
  const s = getStyles(isDark, palette);
  const params = useLocalSearchParams<{
    bookingId?: string;
    orderId?: string;
    driverName?: string;
    carLabel?: string;
    route?: string;
  }>();

  const [location, setLocation] = useState<LiveLocation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchLocation = useCallback(async () => {
    if (!params.bookingId) {
      setLoading(false);
      setError('No trip selected.');
      return;
    }
    try {
      const res = await axiosInstance.get<LiveLocation>(
        `/api/customer/bookings/${params.bookingId}/live-location`
      );
      setLocation(res.data);
      setError('');
    } catch (e: any) {
      setError('Could not load live location. Pull to retry.');
    } finally {
      setLoading(false);
    }
  }, [params.bookingId]);

  // Poll ONLY while this screen is focused - starts on focus, stops on
  // blur/unmount, exactly the "running cost" constraint this screen is
  // built around: no location traffic when the customer isn't looking.
  useFocusEffect(
    useCallback(() => {
      fetchLocation();
      pollRef.current = setInterval(fetchLocation, POLL_INTERVAL_MS);
      return () => {
        if (pollRef.current) clearInterval(pollRef.current);
        pollRef.current = null;
      };
    }, [fetchLocation])
  );

  const hasFix = !!(location?.last_lat && location?.last_lng);
  const isStale = hasFix && !!location?.tracking_left;

  const minutesAgo = location?.last_location_at
    ? Math.max(0, Math.round((Date.now() - new Date(location.last_location_at).getTime()) / 60000))
    : null;

  const handleShare = async () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    const routeLabel = params.route || 'your trip';
    const driverLine = params.driverName ? `Driver: ${params.driverName}. ` : '';
    const locLine = hasFix
      ? `Live location: https://www.google.com/maps?q=${location!.last_lat},${location!.last_lng}`
      : "Live location isn't available yet.";
    try {
      await Share.share({
        message: `I'm on a Drop Cars ride (${routeLabel}). ${driverLine}${locLine}`,
      });
    } catch (e) {
      // Share sheet cancelled/failed - nothing to recover, not an error worth surfacing.
    }
  };

  const openInGoogleMaps = () => {
    if (!hasFix) return;
    Linking.openURL(`https://www.google.com/maps?q=${location!.last_lat},${location!.last_lng}`);
  };

  return (
    <SafeAreaView style={s.container}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />
      <LinearGradient colors={palette.headerGradient} style={[s.headerGradient, { paddingTop: topPadding }]}>
        <View style={s.headerRow}>
          <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
            <ArrowLeft color="#FFFFFF" size={18} />
          </TouchableOpacity>
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.headerTitle}>Live Trip</Text>
            {!!params.route && <Text style={s.headerSub}>{params.route}</Text>}
          </View>
          <TouchableOpacity style={s.backBtn} onPress={handleShare}>
            <Share2 color="#FFFFFF" size={18} />
          </TouchableOpacity>
        </View>
      </LinearGradient>

      <View style={s.mapArea}>
        {Platform.OS !== 'web' && hasFix ? (
          <LiveTripMap lat={location!.last_lat!} lng={location!.last_lng!} driverName={params.driverName} />
        ) : (
          <View style={s.mapFallback}>
            <MapPin color={hasFix ? '#10B981' : palette.textMuted} size={32} />
            {loading ? (
              <Text style={s.mapFallbackText}>Loading live location…</Text>
            ) : hasFix ? (
              <>
                <Text style={s.mapFallbackText}>
                  Last seen {minutesAgo === 0 ? 'just now' : `${minutesAgo} min ago`}
                  {isStale ? ' • sharing paused' : ''}
                </Text>
                <TouchableOpacity style={s.openMapsBtn} onPress={openInGoogleMaps}>
                  <Navigation2 color="#FFFFFF" size={14} />
                  <Text style={s.openMapsBtnText}>Open in Google Maps</Text>
                </TouchableOpacity>
              </>
            ) : (
              <Text style={s.mapFallbackText}>
                {error || 'Waiting for the driver to start sharing location…'}
              </Text>
            )}
          </View>
        )}
      </View>

      <View style={s.infoCard}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <View style={{
              width: 8, height: 8, borderRadius: 4,
              backgroundColor: hasFix && !isStale ? '#10B981' : palette.textMuted,
            }} />
            <Text style={s.statusText}>
              {hasFix && !isStale ? 'Live' : hasFix && isStale ? 'Sharing paused' : 'Not sharing yet'}
            </Text>
          </View>
          <TouchableOpacity onPress={fetchLocation} style={{ padding: 4 }}>
            <RefreshCw color={palette.textMuted} size={15} />
          </TouchableOpacity>
        </View>
        {!!params.driverName && (
          <Text style={s.driverText}>{params.driverName}{params.carLabel ? ` • ${params.carLabel}` : ''}</Text>
        )}
        <TouchableOpacity style={s.shareBtn} onPress={handleShare}>
          <Share2 color="#FFFFFF" size={15} />
          <Text style={s.shareBtnText}>Share Trip</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

function getStyles(isDark: boolean, palette: ThemePalette) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: palette.background },
    headerGradient: { paddingBottom: 14, paddingHorizontal: 16 },
    headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    backBtn: {
      width: 34, height: 34, borderRadius: 17,
      backgroundColor: 'rgba(255,255,255,0.18)',
      alignItems: 'center', justifyContent: 'center',
    },
    headerTitle: { color: '#FFFFFF', fontSize: 16, fontWeight: '900' },
    headerSub: { color: 'rgba(255,255,255,0.85)', fontSize: 11, fontWeight: '600', marginTop: 2 },
    mapArea: { flex: 1, backgroundColor: isDark ? '#0B1220' : '#EEF2F7' },
    mapFallback: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 10, padding: 24 },
    mapFallbackText: { color: palette.textSecondary, fontSize: 13, textAlign: 'center' },
    openMapsBtn: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      backgroundColor: '#0EA5E9', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, marginTop: 4,
    },
    openMapsBtnText: { color: '#FFFFFF', fontSize: 12.5, fontWeight: '800' },
    infoCard: {
      backgroundColor: palette.surface,
      borderTopWidth: 1,
      borderColor: palette.border,
      padding: 16,
      gap: 8,
    },
    statusText: { color: palette.textPrimary, fontSize: 13, fontWeight: '800' },
    driverText: { color: palette.textSecondary, fontSize: 12 },
    shareBtn: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
      backgroundColor: '#0EA5E9', paddingVertical: 12, borderRadius: 12, marginTop: 4,
    },
    shareBtnText: { color: '#FFFFFF', fontSize: 14, fontWeight: '800' },
  });
}
