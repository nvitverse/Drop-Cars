import { Platform, StatusBar } from 'react-native';

// Android draws edge-to-edge (Android 15+ / targetSdk 35), so a screen's own
// header must start BELOW the status bar itself - the old hard-coded 14-20px
// top padding left titles like "Create Oneway Booking" printed underneath the
// clock/battery icons. iOS keeps its fixed notch allowance.
export const ANDROID_STATUS_BAR = Platform.OS === 'android' ? (StatusBar.currentHeight ?? 28) : 0;
