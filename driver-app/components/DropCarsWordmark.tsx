import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// The "DROP | CARS" wordmark from the logo: a blue half with white DROP and a white half (blue outline) with blue CARS.
const BLUE = '#0D47A1';

export default function DropCarsWordmark({ height = 24 }: { height?: number }) {
  const font = Math.round(height * 0.5);
  const r = Math.round(height * 0.26);
  return (
    <View style={[styles.wrap, { height, borderRadius: r, borderColor: BLUE }]}>
      <View style={[styles.left, { paddingHorizontal: Math.round(height * 0.34) }]}>
        <Text style={[styles.text, { fontSize: font, color: '#FFFFFF' }]}>DROP</Text>
      </View>
      <View style={[styles.right, { paddingHorizontal: Math.round(height * 0.34) }]}>
        <Text style={[styles.text, { fontSize: font, color: BLUE }]}>CARS</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: 'row', borderWidth: 2, overflow: 'hidden', backgroundColor: '#FFFFFF', alignSelf: 'flex-start' },
  left: { backgroundColor: BLUE, justifyContent: 'center', alignItems: 'center' },
  right: { backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  text: { fontFamily: 'Inter-Bold', letterSpacing: 0.4 },
});
