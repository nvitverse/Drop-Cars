import React, { forwardRef, useRef } from 'react';
import {
  Animated,
  StyleSheet,
  TouchableOpacity as RNTouchableOpacity,
  type GestureResponderEvent,
  type TouchableOpacityProps,
} from 'react-native';

/**
 * Drop-in replacement for react-native's TouchableOpacity that FEELS alive: the button dips slightly (a soft spring, native-driven so it
 * stays smooth while the JS thread is busy) and fades while a finger is on it, then springs back. Same props, same layout, same
 * behaviour as before - only the press feedback is better. Every screen imports this instead of 'react-native'.
 *   scaleTo  how far it dips (default 0.97; use 1 for no dip, e.g. on huge full-width containers)
 */
export interface TouchableOpacityPropsEx extends TouchableOpacityProps {
  scaleTo?: number;
}

const TouchableOpacity = forwardRef<React.ComponentRef<typeof RNTouchableOpacity>, TouchableOpacityPropsEx>(function TouchableOpacity(
  { style, activeOpacity = 0.72, scaleTo = 0.97, onPressIn, onPressOut, disabled, ...rest },
  ref,
) {
  const scale = useRef(new Animated.Value(1)).current;

  const spring = (to: number) =>
    Animated.spring(scale, { toValue: to, useNativeDriver: true, speed: 60, bounciness: to === 1 ? 6 : 0 }).start();

  // keep any transform the caller already set (rotations, translations) and add the dip on top
  const flat = StyleSheet.flatten(style) || {};
  const existing = Array.isArray((flat as any).transform) ? (flat as any).transform : [];

  return (
    <RNTouchableOpacity
      ref={ref}
      activeOpacity={activeOpacity}
      disabled={disabled}
      {...rest}
      style={[flat, scaleTo !== 1 ? { transform: [...existing, { scale }] } : null]}
      onPressIn={(e: GestureResponderEvent) => {
        if (!disabled && scaleTo !== 1) spring(scaleTo);
        onPressIn?.(e);
      }}
      onPressOut={(e: GestureResponderEvent) => {
        if (scaleTo !== 1) spring(1);
        onPressOut?.(e);
      }}
    />
  );
});

export { TouchableOpacity };
export default TouchableOpacity;
