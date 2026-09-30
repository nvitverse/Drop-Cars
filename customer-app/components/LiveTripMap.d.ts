// Type-only shim for the extensionless '@/components/LiveTripMap' import in
// live-trip.tsx. Metro's bundler already resolves that bare path to
// LiveTripMap.native.tsx (iOS/Android) or LiveTripMap.web.tsx independently
// of tsconfig - this file exists only so tsc has a declaration to check
// against, without a project-wide moduleSuffixes change (tried that; it
// broke unrelated type resolution for every other bare import in the app,
// including third-party packages like lucide-react-native).
import { ComponentType } from 'react';

export interface LiveTripMapProps {
  lat: number;
  lng: number;
  driverName?: string;
}

declare const LiveTripMap: ComponentType<LiveTripMapProps>;
export default LiveTripMap;
