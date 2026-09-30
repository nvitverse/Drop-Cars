import React, { useState } from 'react';
import { View, Image, StyleSheet, Dimensions, ScrollView, TouchableOpacity, Text } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const DEFAULT_IMAGE_WIDTH = SCREEN_WIDTH - 80;
const DEFAULT_IMAGE_HEIGHT = 400;
const MIN_SCALE = 1;
const MAX_SCALE = 5;

function clamp(value: number, min: number, max: number): number {
  'worklet';
  return Math.min(max, Math.max(min, value));
}

interface ZoomableImageProps {
  uri: string;
  width?: number;
  height?: number;
  containerStyle?: object;
  showControls?: boolean;
}

const AnimatedImage = Animated.createAnimatedComponent(Image);

export default function ZoomableImage({
  uri,
  width = DEFAULT_IMAGE_WIDTH,
  height = DEFAULT_IMAGE_HEIGHT,
  containerStyle,
  showControls = true,
}: ZoomableImageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const doubleTapGesture = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        scale.value = withSpring(2.5);
        savedScale.value = 2.5;
      }
    });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      const newScale = savedScale.value * e.scale;
      scale.value = Math.min(MAX_SCALE, Math.max(MIN_SCALE, newScale));
      const maxTx = (width * (scale.value - 1)) / 2;
      const maxTy = (height * (scale.value - 1)) / 2;
      translateX.value = clamp(translateX.value, -maxTx, maxTx);
      translateY.value = clamp(translateY.value, -maxTy, maxTy);
    })
    .onEnd(() => {
      savedScale.value = scale.value;
      if (scale.value <= 1) {
        scale.value = withSpring(1);
        savedScale.value = 1;
        translateX.value = withSpring(0);
        translateY.value = withSpring(0);
        savedTranslateX.value = 0;
        savedTranslateY.value = 0;
      } else {
        const maxTx = (width * (scale.value - 1)) / 2;
        const maxTy = (height * (scale.value - 1)) / 2;
        translateX.value = clamp(translateX.value, -maxTx, maxTx);
        translateY.value = clamp(translateY.value, -maxTy, maxTy);
        savedTranslateX.value = translateX.value;
        savedTranslateY.value = translateY.value;
      }
    });

  const panGesture = Gesture.Pan()
    .manualActivation(true)
    .onTouchesMove((_, state) => {
      if (scale.value > 1) {
        state.activate();
      } else {
        state.fail();
      }
    })
    .onUpdate((e) => {
      const maxTx = (width * (scale.value - 1)) / 2;
      const maxTy = (height * (scale.value - 1)) / 2;
      translateX.value = clamp(
        savedTranslateX.value + e.translationX,
        -maxTx,
        maxTx
      );
      translateY.value = clamp(
        savedTranslateY.value + e.translationY,
        -maxTy,
        maxTy
      );
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composed = Gesture.Race(doubleTapGesture, Gesture.Simultaneous(pinchGesture, panGesture));

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const handleZoomIn = () => {
    const nextScale = Math.min(MAX_SCALE, scale.value + 0.75);
    scale.value = withSpring(nextScale);
    savedScale.value = nextScale;
  };

  const handleZoomOut = () => {
    const nextScale = Math.max(MIN_SCALE, scale.value - 0.75);
    scale.value = withSpring(nextScale);
    savedScale.value = nextScale;
    if (nextScale <= 1) {
      translateX.value = withSpring(0);
      translateY.value = withSpring(0);
      savedTranslateX.value = 0;
      savedTranslateY.value = 0;
    }
  };

  const handleResetZoom = () => {
    scale.value = withSpring(1);
    savedScale.value = 1;
    translateX.value = withSpring(0);
    translateY.value = withSpring(0);
    savedTranslateX.value = 0;
    savedTranslateY.value = 0;
  };

  return (
    <View style={[styles.container, containerStyle, { width, height }]}>
      <GestureDetector gesture={composed}>
        <Animated.View style={[styles.wrapper, { width, height }]}>
          <AnimatedImage
            source={{ uri }}
            style={[
              styles.image,
              {
                width,
                height,
              },
              animatedStyle,
            ]}
            resizeMode="contain"
          />
        </Animated.View>
      </GestureDetector>

      {showControls && (
        <View style={styles.floatingControls}>
          <TouchableOpacity style={styles.controlBtn} onPress={handleZoomIn} activeOpacity={0.8}>
            <ZoomIn size={16} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlBtn} onPress={handleZoomOut} activeOpacity={0.8}>
            <ZoomOut size={16} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity style={styles.controlBtn} onPress={handleResetZoom} activeOpacity={0.8}>
            <RotateCcw size={16} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  image: {
    borderRadius: 6,
  },
  floatingControls: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    flexDirection: 'row',
    gap: 8,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  controlBtn: {
    padding: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
