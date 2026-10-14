import React, { useEffect, useRef } from 'react';
import { Animated, Easing, type StyleProp, type ViewStyle } from 'react-native';

/**
 * Content that eases in (fades up a few pixels) when it first appears - one small component used for cards and rows so every screen
 * opens with the same gentle motion instead of popping in. Native-driven, so it stays smooth while the screen is busy loading.
 *   delay    wait before starting (use index * 40 to stagger a list)
 *   distance how far it rises from (px)
 */
export default function FadeIn({ children, delay = 0, duration = 240, distance = 8, style }: {
  children?: React.ReactNode; delay?: number; duration?: number; distance?: number; style?: StyleProp<ViewStyle>;
}) {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(v, { toValue: 1, duration, delay, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Animated.View style={[style, { opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }) }] }]}>
      {children}
    </Animated.View>
  );
}
