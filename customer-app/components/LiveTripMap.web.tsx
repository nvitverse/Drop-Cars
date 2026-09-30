import React from 'react';

// Web build of LiveTripMap - react-native-maps has no web implementation,
// so this file intentionally renders nothing. live-trip.tsx already shows
// its own "open in Google Maps" fallback UI around this component on web.
export default function LiveTripMap(_props: { lat: number; lng: number; driverName?: string }) {
  return null;
}
