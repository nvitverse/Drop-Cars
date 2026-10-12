import React, { useEffect, useRef, useState } from 'react';
import { View, Image, Animated, Easing, StyleSheet, useWindowDimensions } from 'react-native';

let LOADING_IMAGE: any = null;
try {
  LOADING_IMAGE = require('../assets/images/loading-screen.webp');
} catch (e) {
  LOADING_IMAGE = null;
}

export default function AppLoadingScreen() {
  const { width, height } = useWindowDimensions();
  const [imgError, setImgError] = useState(false);
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
  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1.08] });
  const glow = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.25, 0.6] });

  const top = height * 0.575 - 34;

  return (
    <View style={styles.container}>
      {LOADING_IMAGE && !imgError && (
        <Image
          source={LOADING_IMAGE}
          style={{ width, height, position: 'absolute' }}
          resizeMode="cover"
          onError={() => setImgError(true)}
        />
      )}
      <View style={[styles.loaderWrap, { top }]} pointerEvents="none">
        <Animated.View style={[styles.glow, { opacity: glow, transform: [{ scale }] }]} />
        <Animated.View style={[styles.ring, { transform: [{ rotate }] }]} />
        <View style={styles.dot} />
      </View>
    </View>
  );
}

const SIZE = 56;

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0B1E4A' },
  loaderWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', justifyContent: 'center', height: SIZE + 12 },
  glow: { position: 'absolute', width: SIZE + 12, height: SIZE + 12, borderRadius: (SIZE + 12) / 2, backgroundColor: '#3B82F6' },
  ring: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 4,
    borderColor: 'rgba(30, 58, 138, 0.25)',
    borderTopColor: '#1E3A8A',
    borderRightColor: '#2563EB',
  },
  dot: { position: 'absolute', width: 10, height: 10, borderRadius: 5, backgroundColor: '#1E3A8A' },
});
