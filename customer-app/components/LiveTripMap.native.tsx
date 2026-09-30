import React from 'react';
import MapView, { Marker } from 'react-native-maps';

// Native-only (.native.tsx) - Metro resolves this file for iOS/Android and
// the separate LiveTripMap.web.tsx for web, so react-native-maps (which has
// no web implementation) never gets pulled into the web bundle at all. A
// runtime Platform.OS check alone doesn't achieve this - Metro still tries
// to statically resolve every require() in a file regardless of a runtime
// `if`, so the split has to happen at the file-resolution level instead.
export default function LiveTripMap({
  lat,
  lng,
  driverName,
}: {
  lat: number;
  lng: number;
  driverName?: string;
}) {
  return (
    <MapView
      style={{ flex: 1 }}
      initialRegion={{
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }}
      region={{
        latitude: lat,
        longitude: lng,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
      }}
    >
      <Marker coordinate={{ latitude: lat, longitude: lng }} title={driverName || 'Driver'} />
    </MapView>
  );
}
