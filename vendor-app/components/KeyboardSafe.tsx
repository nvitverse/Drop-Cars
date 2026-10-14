import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import {
  Dimensions,
  Keyboard,
  KeyboardAvoidingView as RNKeyboardAvoidingView,
  Modal as RNModal,
  ModalProps,
  Platform,
  StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  ViewProps,
  ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * ONE place that makes sure the text box being typed in is never hidden behind the keyboard - and that the screen is back to
 * exactly where it was when the keyboard closes.
 *
 * Why: on Android the app draws edge to edge, so the keyboard no longer shrinks the screen. React Native's KeyboardAvoidingView
 * could leave a gap behind after the keyboard closed. This version just reads the keyboard's real height from the screen's
 * coordinates, lifts by exactly that, and goes back to 0 when the keyboard hides. If the phone DID resize the window itself
 * (older Android settings) it lifts by nothing, so it can never double up. iOS keeps the built-in behaviour.
 */
export function useKeyboardHeight(): number {
  const [kb, setKb] = useState(0);
  const { height: windowHeight } = useWindowDimensions();
  const baseWindowHeight = useRef(windowHeight);

  useEffect(() => {
    if (Platform.OS !== 'android') return;
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      const screenH = Dimensions.get('screen').height;
      setKb(Math.max(0, Math.round(screenH - e.endCoordinates.screenY)));
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => setKb(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  // remember the window's height while the keyboard is closed; if it shrank by about the keyboard's height the system already
  // resized the screen for us and we must not lift again
  useEffect(() => { if (kb === 0) baseWindowHeight.current = windowHeight; }, [kb, windowHeight]);
  const systemResized = kb > 0 && baseWindowHeight.current - windowHeight >= kb * 0.6;
  return Platform.OS === 'android' && !systemResized ? kb : 0;
}

/** Bottom padding for a sheet that is anchored to the bottom of an edge-to-edge window: the keyboard's height while it is open,
 *  otherwise the phone's navigation bar height (so buttons are never hidden behind the nav bar). */
export function useSheetBottomPadding(extra: number = 0): number {
  const kb = useKeyboardHeight();
  const { bottom } = useSafeAreaInsets();
  return (kb > 0 ? kb : Platform.OS === 'android' ? bottom : 0) + extra;
}

/** For a sheet anchored to the bottom of a modal that draws under the navigation bar (statusBarTranslucent): the nav bar's height while the
 *  keyboard is closed (so the last button / the typing box is not hidden behind it), 0 while the keyboard is open (the modal lifts the sheet). */
export function useNavInsetWhenClosed(): number {
  const kb = useKeyboardHeight();
  const { bottom } = useSafeAreaInsets();
  return Platform.OS === 'android' && kb === 0 ? bottom : 0;
}

// Lifting must happen ONCE. The screen root / a Modal lifts everything inside it (KeyboardSafeView); a KeyboardAvoidingView found inside
// one of those just lays out normally, otherwise a screen with its own KeyboardAvoidingView would be lifted twice.
const LiftedContext = createContext(false);

/** Drop-in for react-native's KeyboardAvoidingView (same props; behavior / keyboardVerticalOffset are accepted and ignored on Android). */
export function KeyboardAvoidingView(props: ViewProps & { behavior?: 'padding' | 'height' | 'position'; keyboardVerticalOffset?: number; enabled?: boolean; contentContainerStyle?: StyleProp<ViewStyle> }) {
  const { children, style, behavior, keyboardVerticalOffset, enabled, contentContainerStyle, ...rest } = props;
  const kb = useKeyboardHeight();
  const alreadyLifted = useContext(LiftedContext);
  if (Platform.OS !== 'android') {
    return (
      <RNKeyboardAvoidingView behavior="padding" keyboardVerticalOffset={keyboardVerticalOffset} enabled={enabled} style={style} {...rest}>
        {children}
      </RNKeyboardAvoidingView>
    );
  }
  if (alreadyLifted) {
    return <View {...rest} style={style}>{children}</View>;
  }
  const flat = StyleSheet.flatten(style) || {};
  const own = typeof flat.paddingBottom === 'number' ? flat.paddingBottom : 0;
  return (
    <LiftedContext.Provider value={true}>
      <View {...rest} style={[style, kb > 0 && enabled !== false ? { paddingBottom: own + kb } : null]}>
        {children}
      </View>
    </LiftedContext.Provider>
  );
}

/** The screen root / a modal's body: lifts everything inside by the keyboard's height (always, whatever is above it). */
export function KeyboardSafeView({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  const kb = useKeyboardHeight();
  if (Platform.OS !== 'android') return <View style={[{ flex: 1 }, style]}>{children}</View>;
  return (
    <LiftedContext.Provider value={true}>
      <View style={[{ flex: 1 }, style, kb > 0 ? { paddingBottom: kb } : null]}>{children}</View>
    </LiftedContext.Provider>
  );
}

/** Drop-in replacement for react-native's Modal: same props, but its content lifts above the keyboard on Android. */
export default function KeyboardSafeModal(props: ModalProps) {
  const { children, ...rest } = props;
  const nav = useNavInsetWhenClosed();
  // A see-through modal (bottom sheet / dialog over a dim backdrop) draws under the phone's navigation bar, so its last row of buttons ended up
  // behind the bar. Lift its content by the bar's height and dim the strip below it the same way. A modal that handles the bar itself
  // (statusBarTranslucent + useNavInsetWhenClosed) and full-screen modals (their own SafeAreaView) are left alone.
  const lift = rest.transparent && !rest.statusBarTranslucent && nav > 0 ? nav : 0;
  return (
    <RNModal {...rest}>
      <KeyboardSafeView style={lift ? { paddingBottom: lift } : undefined}>{children}</KeyboardSafeView>
      {lift > 0 && <View pointerEvents="none" style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: lift, backgroundColor: 'rgba(0,0,0,0.5)' }} />}
    </RNModal>
  );
}
