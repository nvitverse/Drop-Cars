import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  TouchableOpacity,
  Animated,
  Dimensions,
  Platform,
  KeyboardAvoidingView,
  TouchableWithoutFeedback,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '@/contexts/ThemeContext';
import { DesignTokens } from '@/constants/designTokens';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');

interface MotionBottomSheetProps {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeight?: number | string;
  enableBackdropDismiss?: boolean;
}

export default function MotionBottomSheet({
  visible,
  onClose,
  children,
  maxHeight = '85%',
  enableBackdropDismiss = true,
}: MotionBottomSheetProps) {
  const { colors, isDarkMode } = useTheme();
  const translateY = useRef(new Animated.Value(SCREEN_HEIGHT)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;
  const [rendered, setRendered] = React.useState(visible);

  useEffect(() => {
    if (visible) {
      setRendered(true);
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          damping: DesignTokens.spring.damping,
          stiffness: DesignTokens.spring.stiffness,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(backdropOpacity, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: SCREEN_HEIGHT,
          duration: 220,
          useNativeDriver: true,
        }),
      ]).start(() => setRendered(false));
    }
  }, [visible]);

  if (!rendered) return null;

  return (
    <Modal
      transparent
      visible={rendered}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardContainer}
      >
        <TouchableWithoutFeedback onPress={enableBackdropDismiss ? onClose : undefined}>
          <Animated.View
            style={[
              styles.backdrop,
              {
                opacity: backdropOpacity,
                backgroundColor: isDarkMode ? 'rgba(0,0,0,0.7)' : 'rgba(15,23,42,0.45)',
              },
            ]}
          >
            {Platform.OS === 'ios' && (
              <BlurView intensity={25} tint={isDarkMode ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
            )}
          </Animated.View>
        </TouchableWithoutFeedback>

        <Animated.View
          style={[
            styles.sheetContainer,
            {
              transform: [{ translateY }],
              maxHeight: maxHeight as any,
              backgroundColor: isDarkMode ? DesignTokens.colors.darkElevated : DesignTokens.colors.lightSurface,
              borderColor: isDarkMode ? DesignTokens.colors.darkBorder : DesignTokens.colors.lightBorder,
            },
          ]}
        >
          {/* Top Grab Handle */}
          <View style={styles.handleContainer}>
            <View
              style={[
                styles.handle,
                {
                  backgroundColor: isDarkMode ? 'rgba(255,255,255,0.2)' : '#CBD5E1',
                },
              ]}
            />
          </View>
          {children}
        </Animated.View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  keyboardContainer: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  sheetContainer: {
    width: '100%',
    borderTopLeftRadius: DesignTokens.radius.sheet,
    borderTopRightRadius: DesignTokens.radius.sheet,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.15,
    shadowRadius: 18,
    elevation: 20,
  },
  handleContainer: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 10,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
});
