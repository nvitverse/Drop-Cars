import React from 'react';
import { KeyboardAvoidingView, Modal as RNModal, ModalProps, Platform, StyleProp, View, ViewStyle } from 'react-native';

/**
 * Keeps the field being typed in ABOVE the keyboard.
 *
 * On Android the phone's keyboard no longer shrinks the screen (the app draws edge to edge), so a text box near the bottom - the chat
 * reply box, a form's last field, a bottom sheet's input - ended up hidden behind the keyboard and nobody could see what they typed.
 * KeyboardAvoidingView in "padding" mode lifts the content by exactly the keyboard's height; when the system already resized the
 * window it measures an overlap of 0 and does nothing, so it is safe on every phone. iOS already did this and is left alone.
 */
export function KeyboardSafeView({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
  if (Platform.OS !== 'android') return <View style={[{ flex: 1 }, style]}>{children}</View>;
  return (
    <KeyboardAvoidingView behavior="padding" style={[{ flex: 1 }, style]}>
      {children}
    </KeyboardAvoidingView>
  );
}

/** Drop-in replacement for react-native's Modal: same props, but its content lifts above the keyboard on Android. */
export default function KeyboardSafeModal(props: ModalProps) {
  const { children, ...rest } = props;
  return (
    <RNModal {...rest}>
      <KeyboardSafeView>{children}</KeyboardSafeView>
    </RNModal>
  );
}
