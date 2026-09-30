import React, { useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  PanResponder,
  Animated,
  Dimensions,
} from 'react-native';
import { ChevronRight, Check } from 'lucide-react-native';

interface SwipeSliderProps {
  onSwipeComplete: () => void;
  title?: string;
  confirmedTitle?: string;
  color?: string;
  disabled?: boolean;
}

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SLIDER_WIDTH = SCREEN_WIDTH - 64;
const THUMB_SIZE = 52;
const MAX_SWIPE = SLIDER_WIDTH - THUMB_SIZE - 8;

export default function SwipeSlider({
  onSwipeComplete,
  title = 'SWIPE TO START TRIP',
  confirmedTitle = 'TRIP STARTED ✓',
  color = '#10B981',
  disabled = false,
}: SwipeSliderProps) {
  const pan = useRef(new Animated.Value(0)).current;
  const thumbScale = useRef(new Animated.Value(1)).current;
  const successScale = useRef(new Animated.Value(0.8)).current;
  const [completed, setCompleted] = useState(false);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !completed && !disabled,
      onMoveShouldSetPanResponder: () => !completed && !disabled,
      onPanResponderGrant: () => {
        Animated.spring(thumbScale, {
          toValue: 1.12,
          useNativeDriver: false,
          bounciness: 10,
        }).start();
      },
      onPanResponderMove: (_, gestureState) => {
        if (completed || disabled) return;
        const newX = Math.max(0, Math.min(gestureState.dx, MAX_SWIPE));
        pan.setValue(newX);
      },
      onPanResponderRelease: (_, gestureState) => {
        if (completed || disabled) return;
        Animated.spring(thumbScale, {
          toValue: 1,
          useNativeDriver: false,
          bounciness: 6,
        }).start();

        if (gestureState.dx >= MAX_SWIPE * 0.75) {
          // Snap to end and trigger action with success pulse
          Animated.timing(pan, {
            toValue: MAX_SWIPE,
            duration: 140,
            useNativeDriver: false,
          }).start(() => {
            setCompleted(true);
            Animated.spring(successScale, {
              toValue: 1,
              useNativeDriver: false,
              bounciness: 12,
            }).start();
            onSwipeComplete();
          });
        } else {
          // Spring back
          Animated.spring(pan, {
            toValue: 0,
            useNativeDriver: false,
            bounciness: 10,
          }).start();
        }
      },
    })
  ).current;

  return (
    <View style={[styles.container, { opacity: disabled ? 0.6 : 1 }]}>
      <View style={[styles.track, { backgroundColor: completed ? color : '#1E293B' }]}>
        <Text style={styles.titleText}>{completed ? confirmedTitle : title}</Text>
        
        {!completed && (
          <Animated.View
            {...panResponder.panHandlers}
            style={[
              styles.thumb,
              {
                backgroundColor: color,
                transform: [{ translateX: pan }, { scale: thumbScale }],
              },
            ]}
          >
            <ChevronRight size={24} color="#FFFFFF" />
          </Animated.View>
        )}

        {completed && (
          <Animated.View style={[styles.thumb, { backgroundColor: '#FFFFFF', right: 4, position: 'absolute', transform: [{ scale: successScale }] }]}>
            <Check size={24} color={color} />
          </Animated.View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 8,
    width: '100%',
  },
  track: {
    height: 60,
    borderRadius: 30,
    justifyContent: 'center',
    paddingHorizontal: 4,
    position: 'relative',
    overflow: 'hidden',
  },
  titleText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    textAlign: 'center',
    letterSpacing: 1,
  },
  thumb: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    borderRadius: THUMB_SIZE / 2,
    position: 'absolute',
    left: 4,
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
});
