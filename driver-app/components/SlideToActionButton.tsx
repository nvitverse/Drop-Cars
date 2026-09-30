import React, { useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Animated,
  Dimensions,
} from 'react-native';
import { ChevronRight, CheckCircle2 } from 'lucide-react-native';

interface SlideToActionButtonProps {
  label: string;
  onSlideComplete: () => void;
  backgroundColor?: string;
  sliderColor?: string;
  textColor?: string;
  isCompleted?: boolean;
}

const BUTTON_WIDTH = Dimensions.get('window').width - 48;
const SLIDER_SIZE = 52;
const MAX_TRANSLATE = BUTTON_WIDTH - SLIDER_SIZE - 8;

export default function SlideToActionButton({
  label,
  onSlideComplete,
  backgroundColor = '#0F172A',
  sliderColor = '#22C55E',
  textColor = '#F8FAFC',
  isCompleted = false,
}: SlideToActionButtonProps) {
  const pan = useRef(new Animated.Value(0)).current;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: (_, gestureState) => {
        if (isCompleted) return;
        const newX = Math.max(0, Math.min(gestureState.dx, MAX_TRANSLATE));
        pan.setValue(newX);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (isCompleted) return;
        if (gestureState.dx >= MAX_TRANSLATE * 0.75) {
          // Slide threshold reached
          Animated.timing(pan, {
            toValue: MAX_TRANSLATE,
            duration: 150,
            useNativeDriver: true,
          }).start(() => {
            onSlideComplete();
          });
        } else {
          // Snap back
          Animated.spring(pan, {
            toValue: 0,
            tension: 40,
            friction: 7,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  return (
    <View style={[styles.container, { backgroundColor }]}>
      <Text style={[styles.text, { color: textColor }]}>
        {isCompleted ? 'ACTION COMPLETED' : label}
      </Text>
      
      <Animated.View
        style={[
          styles.slider,
          { backgroundColor: isCompleted ? '#16A34A' : sliderColor },
          {
            transform: [{ translateX: isCompleted ? MAX_TRANSLATE : pan }],
          },
        ]}
        {...(isCompleted ? {} : panResponder.panHandlers)}
      >
        {isCompleted ? (
          <CheckCircle2 size={24} color="#FFFFFF" />
        ) : (
          <View style={styles.arrowRow}>
            <ChevronRight size={22} color="#FFFFFF" style={{ marginRight: -10 }} />
            <ChevronRight size={22} color="#FFFFFF" />
          </View>
        )}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
    position: 'relative',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  text: {
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
  slider: {
    position: 'absolute',
    left: 4,
    width: SLIDER_SIZE,
    height: SLIDER_SIZE,
    borderRadius: SLIDER_SIZE / 2,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  arrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
