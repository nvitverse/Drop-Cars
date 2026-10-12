import React from 'react';
import { Image, Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

/**
 * The Drop Cars Driver badge (assets/images/driver-logo-small.png) in a round white ring with a soft glow - used wherever a screen used to show a
 * plain "car" icon as a stand-in for the logo (language picker, login, sign-up, duty-driver sign-in ...). One place, so the look stays the same.
 */
export default function BrandLogo({ size = 72, ring = true, style }: { size?: number; ring?: boolean; style?: StyleProp<ViewStyle> }) {
  const pad = ring ? Math.max(3, Math.round(size * 0.05)) : 0;
  const outer = size + pad * 2;
  return (
    <View
      style={[
        styles.wrap,
        ring && styles.ring,
        { width: outer, height: outer, borderRadius: outer / 2 },
        style,
      ]}
      accessible
      accessibilityRole="image"
      accessibilityLabel="Drop Cars Driver"
    >
      <Image
        source={require('@/assets/images/driver-logo-small.png')}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  ring: {
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: { shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12 },
      android: { elevation: 8 },
      default: { shadowColor: '#3B82F6', shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.35, shadowRadius: 12 },
    }),
  },
});
