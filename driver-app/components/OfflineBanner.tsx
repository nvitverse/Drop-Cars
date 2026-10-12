import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { WifiOff, RefreshCw } from 'lucide-react-native';
import NetInfo from '@react-native-community/netinfo';
import { useTheme } from '@/hooks/useTheme';

export const OfflineBanner: React.FC = () => {
  const { colors } = useTheme();
  const [isConnected, setIsConnected] = useState<boolean | null>(true);
  const [retrying, setRetrying] = useState(false);

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsConnected(state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  const handleRetry = () => {
    setRetrying(true);
    NetInfo.fetch().then((state) => {
      setIsConnected(state.isConnected);
      setRetrying(false);
    });
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
