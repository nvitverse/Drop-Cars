import React, { useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, TouchableOpacity } from 'react-native';
import { Zap } from 'lucide-react-native';
import { clearRequestCache } from '@/utils/requestCache';

/**
 * Small floating ⚡ button (bottom-right): one tap fetches fresh data for the page.
 * It empties the small response cache first, then runs the page's own refresh function.
 * Place it as the LAST child of the page's root view. `bottom` is the gap from the screen bottom.
 */
export default function RefreshFab({ onRefresh, bottom = 24 }: { onRefresh?: () => any; bottom?: number }) {
  const [busy, setBusy] = useState(false);
  const spin = useRef(new Animated.Value(0)).current;

  const press = async () => {
    if (busy) return;
    setBusy(true);
    spin.setValue(0);
    Animated.timing(spin, { toValue: 1, duration: 700, easing: Easing.linear, useNativeDriver: true }).start();
    clearRequestCache();
    try {
      await Promise.resolve(onRefresh?.());
    } catch {
      // the page shows its own error
    } finally {
      setTimeout(() => setBusy(false), 700);
    }
  };

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      onPress={press}
      accessibilityLabel="Refresh this page"
      style={[styles.fab, { bottom }]}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
    >
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Zap size={20} color="#FFFFFF" fill="#FFFFFF" />
      </Animated.View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 16,
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: '#F59E0B',
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 0.94,
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    zIndex: 50,
  },
});
