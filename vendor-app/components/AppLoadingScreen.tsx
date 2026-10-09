import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, Easing, StyleSheet, useWindowDimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Briefcase } from 'lucide-react-native';

export default function AppLoadingScreen() {
  const { width, height } = useWindowDimensions();
  const spin = useRef(new Animated.Value(0)).current;
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const spinLoop = Animated.loop(
      Animated.timing(spin, { toValue: 1, duration: 1100, easing: Easing.linear, useNativeDriver: true })
    );
    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    spinLoop.start();
    pulseLoop.start();
    return () => {
      spinLoop.stop();
      pulseLoop.stop();
    };
  }, [spin, pulse]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.92, 1.08] });
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.65] });

  return (
    <LinearGradient
      colors={['#064E3B', '#0F172A', '#0B1E4A']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.container, { width, height }]}
    >
      <View style={styles.centerBox}>
        {/* Brand Icon & Wordmark */}
        <View style={styles.logoRow}>
          <View style={styles.badgeWrap}>
            <Briefcase size={28} color="#34D399" />
          </View>
          <View>
            <Text style={styles.title}>DROP CARS</Text>
            <Text style={styles.subtitle}>VENDOR PARTNER</Text>
          </View>
        </View>

        {/* Animated Ring Loader */}
        <View style={styles.loaderWrap}>
          <Animated.View style={[styles.glow, { opacity: glow, transform: [{ scale }] }]} />
          <Animated.View style={[styles.ring, { transform: [{ rotate }] }]} />
          <View style={styles.dot} />
        </View>

        <Text style={styles.loadingText}>Loading partner portal...</Text>
      </View>
    </LinearGradient>
  );
}

const SIZE = 52;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerBox: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 44,
  },
  badgeWrap: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: 'rgba(52, 211, 153, 0.15)',
    borderWidth: 1.5,
    borderColor: 'rgba(52, 211, 153, 0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 22,
    fontFamily: 'Inter-Black',
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 1.5,
  },
  subtitle: {
    fontSize: 10,
    fontFamily: 'Inter-Bold',
    fontWeight: '800',
    color: '#34D399',
    letterSpacing: 2.2,
    marginTop: 2,
  },
  loaderWrap: {
    width: SIZE + 16,
    height: SIZE + 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  glow: {
    position: 'absolute',
    width: SIZE + 16,
    height: SIZE + 16,
    borderRadius: (SIZE + 16) / 2,
    backgroundColor: '#059669',
  },
  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 3.5,
    borderColor: 'rgba(52, 211, 153, 0.2)',
    borderTopColor: '#34D399',
    borderRightColor: '#6EE7B7',
  },
  dot: {
    position: 'absolute',
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#34D399',
  },
  loadingText: {
    fontSize: 12.5,
    fontFamily: 'Inter-Medium',
    color: 'rgba(255, 255, 255, 0.65)',
    letterSpacing: 0.5,
  },
});
