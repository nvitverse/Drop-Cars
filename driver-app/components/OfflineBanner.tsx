// A red strip at the top of the screen when the phone cannot reach the server ("No internet"), with a Retry button. It only
// pings the server (no native module), so it works through normal OTA updates. Any answer from the server - even an error
// page - counts as online; only a network failure or a 4 second silence counts as offline.
import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, StyleSheet, AppState } from 'react-native';
import { TouchableOpacity } from '@/components/ui/TouchableOpacity';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WifiOff, RefreshCw } from 'lucide-react-native';

const PING_URL = 'https://drop-cars-api-207918408785.asia-south2.run.app/';

export const OfflineBanner: React.FC = () => {
  const insets = useSafeAreaInsets();
  const [isOffline, setIsOffline] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const check = useCallback(async () => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    try {
      await fetch(PING_URL, { method: 'HEAD', signal: controller.signal });
      setIsOffline(false);
    } catch {
      setIsOffline(true);
    } finally {
      clearTimeout(timer);
    }
  }, []);

  useEffect(() => {
    check();
    const sub = AppState.addEventListener('change', (s) => { if (s === 'active') check(); });
    const id = setInterval(check, 30000);
    return () => { sub.remove(); clearInterval(id); };
  }, [check]);

  const retry = async () => {
    setRetrying(true);
    await check();
    setRetrying(false);
  };

  if (!isOffline) return null;

  return (
    <View style={[styles.banner, { paddingTop: insets.top + 6 }]} pointerEvents="box-none">
      <View style={styles.leftRow}>
        <WifiOff size={15} color="#FFFFFF" />
        <Text style={styles.text} numberOfLines={1}>No internet - please check your network</Text>
      </View>
      <TouchableOpacity style={styles.retryBtn} onPress={retry} disabled={retrying} activeOpacity={0.7}>
        <RefreshCw size={12} color="#FFFFFF" />
        <Text style={styles.retryText}>{retrying ? 'Checking...' : 'Retry'}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 9999,
    backgroundColor: '#DC2626',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 7,
    gap: 8,
  },
  leftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  text: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'Inter-Medium',
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  retryText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontFamily: 'Inter-Bold',
  },
});

export default OfflineBanner;
