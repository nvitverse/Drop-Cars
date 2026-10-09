import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { WifiOff, RefreshCw } from 'lucide-react-native';
import { useTheme } from '@/hooks/useTheme';

export const OfflineBanner: React.FC = () => {
  const { colors } = useTheme();
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  const [retrying, setRetrying] = useState(false);

  // Pure JS (no native package, so it ships by OTA): a tiny request every 15 s; two misses in a row = offline.
  const probe = async (): Promise<boolean> => {
    try {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 5000);
      await fetch('https://clients3.google.com/generate_204', { method: 'GET', cache: 'no-store', signal: ctl.signal });
      clearTimeout(timer);
      return true;
    } catch {
      return false;
    }
  };

  useEffect(() => {
    let alive = true;
    let misses = 0;
    const tick = async () => {
      const ok = await probe();
      if (!alive) return;
      misses = ok ? 0 : misses + 1;
      setIsConnected(misses >= 2 ? false : true);
    };
    tick();
    const id = setInterval(tick, 15000);
    return () => { alive = false; clearInterval(id); };
  }, []);

  const handleRetry = async () => {
    setRetrying(true);
    const ok = await probe();
    setIsConnected(ok);
    setRetrying(false);
  };

  if (isConnected !== false) return null;

  return (
    <View style={styles.banner}>
      <View style={styles.leftRow}>
        <WifiOff size={15} color="#FFFFFF" />
        <Text style={styles.text} numberOfLines={1}>
          No internet — showing last saved data
        </Text>
      </View>
      <TouchableOpacity
        style={styles.retryBtn}
        onPress={handleRetry}
        disabled={retrying}
        activeOpacity={0.7}
      >
        <RefreshCw size={12} color="#FFFFFF" />
        <Text style={styles.retryText}>{retrying ? 'Checking...' : 'Retry'}</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
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
