import React from 'react';
import Svg, { Path, Circle, Rect } from 'react-native-svg';

export interface IllustrationProps {
  size?: number;
  primaryColor?: string;
  secondaryColor?: string;
}

export function NoBookingsSvg({
  size = 72,
  primaryColor = '#6366F1',
  secondaryColor = '#C7D2FE',
}: IllustrationProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      <Circle cx="36" cy="36" r="32" fill={secondaryColor} fillOpacity="0.3" />
      <Rect x="20" y="18" width="32" height="36" rx="6" stroke={primaryColor} strokeWidth="2.5" />
      <Path d="M28 26H44" stroke={primaryColor} strokeWidth="2.5" strokeLinecap="round" />
      <Path d="M28 34H40" stroke={primaryColor} strokeWidth="2.5" strokeLinecap="round" />
      <Path d="M28 42H36" stroke={primaryColor} strokeWidth="2.5" strokeLinecap="round" />
      <Circle cx="47" cy="47" r="9" fill={primaryColor} />
      <Path d="M44 47H50" stroke="#FFFFFF" strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}

export function NoCarsSvg({
  size = 72,
  primaryColor = '#6366F1',
  secondaryColor = '#C7D2FE',
}: IllustrationProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      <Circle cx="36" cy="36" r="32" fill={secondaryColor} fillOpacity="0.3" />
      <Path
        d="M20 40L24 26C24.5 24.5 26 23.5 27.5 23.5H44.5C46 23.5 47.5 24.5 48 26L52 40V48C52 49.1 51.1 50 50 50H48C46.9 50 46 49.1 46 48V46H26V48C26 49.1 25.1 50 24 50H22C20.9 50 20 49.1 20 48V40Z"
        stroke={primaryColor}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <Circle cx="27" cy="40" r="3" fill={primaryColor} />
      <Circle cx="45" cy="40" r="3" fill={primaryColor} />
    </Svg>
  );
}

export function NoChatsSvg({
  size = 72,
  primaryColor = '#6366F1',
  secondaryColor = '#C7D2FE',
}: IllustrationProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      <Circle cx="36" cy="36" r="32" fill={secondaryColor} fillOpacity="0.3" />
      <Path
        d="M22 24C22 20.7 24.7 18 28 18H44C47.3 18 50 20.7 50 24V38C50 41.3 47.3 44 44 44H34L26 50V44H28C24.7 44 22 41.3 22 38V24Z"
        stroke={primaryColor}
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <Circle cx="30" cy="31" r="2" fill={primaryColor} />
      <Circle cx="36" cy="31" r="2" fill={primaryColor} />
      <Circle cx="42" cy="31" r="2" fill={primaryColor} />
    </Svg>
  );
}

export function NoInternetSvg({
  size = 72,
  primaryColor = '#EF4444',
  secondaryColor = '#FECACA',
}: IllustrationProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      <Circle cx="36" cy="36" r="32" fill={secondaryColor} fillOpacity="0.3" />
      <Path
        d="M18 26C28 17 44 17 54 26"
        stroke={primaryColor}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <Path
        d="M24 33C31 27 41 27 48 33"
        stroke={primaryColor}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <Path
        d="M30 40C33.5 37 38.5 37 42 40"
        stroke={primaryColor}
        strokeWidth="2.5"
        strokeLinecap="round"
      />
      <Circle cx="36" cy="47" r="2.5" fill={primaryColor} />
      <Path d="M20 52L52 20" stroke={primaryColor} strokeWidth="2.5" strokeLinecap="round" />
    </Svg>
  );
}

export function NoDocumentsSvg({
  size = 72,
  primaryColor = '#6366F1',
  secondaryColor = '#C7D2FE',
}: IllustrationProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 72 72" fill="none">
      <Circle cx="36" cy="36" r="32" fill={secondaryColor} fillOpacity="0.3" />
      <Rect x="22" y="16" width="28" height="40" rx="4" stroke={primaryColor} strokeWidth="2.5" />
      <Path d="M30 26H42" stroke={primaryColor} strokeWidth="2" strokeLinecap="round" />
      <Path d="M30 33H42" stroke={primaryColor} strokeWidth="2" strokeLinecap="round" />
      <Path d="M30 40H38" stroke={primaryColor} strokeWidth="2" strokeLinecap="round" />
    </Svg>
  );
}
