import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { Colors } from '../constants/theme';

interface VoiceWaveformProps {
  isActive: boolean;
  audioLevel?: number; // 0–1 normalized from mic metering
  barCount?: number;
  color?: string;
  height?: number;
}

export function VoiceWaveform({
  isActive,
  audioLevel = 0,
  barCount = 5,
  color = Colors.brand[600],
  height = 40,
}: VoiceWaveformProps) {
  return (
    <View style={[styles.container, { height }]}>
      {Array.from({ length: barCount }).map((_, i) => (
        <WaveBar
          key={i}
          index={i}
          total={barCount}
          isActive={isActive}
          audioLevel={audioLevel}
          color={color}
          maxHeight={height}
        />
      ))}
    </View>
  );
}

interface WaveBarProps {
  index: number;
  total: number;
  isActive: boolean;
  audioLevel: number;
  color: string;
  maxHeight: number;
}

function WaveBar({
  index,
  total,
  isActive,
  audioLevel,
  color,
  maxHeight,
}: WaveBarProps) {
  const barHeight = useSharedValue(4);

  // Delay each bar slightly for wave effect
  const delay = (index / total) * 200;
  const minH = 4;
  const maxH = maxHeight * 0.8;

  useEffect(() => {
    if (isActive) {
      const targetH = minH + (maxH - minH) * (0.3 + Math.random() * 0.7);

      barHeight.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(targetH, {
              duration: 300 + Math.random() * 200,
              easing: Easing.inOut(Easing.ease),
            }),
            withTiming(minH + (maxH - minH) * 0.2, {
              duration: 300 + Math.random() * 200,
              easing: Easing.inOut(Easing.ease),
            }),
          ),
          -1,
          true,
        ),
      );
    } else {
      cancelAnimation(barHeight);
      barHeight.value = withTiming(minH, { duration: 200 });
    }
  }, [isActive]);

  // When audio level changes, adjust range
  useEffect(() => {
    if (isActive && audioLevel > 0) {
      const boost = audioLevel * (maxH - minH) * 0.5;
      barHeight.value = withTiming(minH + boost + Math.random() * boost, {
        duration: 100,
      });
    }
  }, [audioLevel]);

  const animatedStyle = useAnimatedStyle(() => ({
    height: barHeight.value,
  }));

  return (
    <Animated.View
      style={[
        styles.bar,
        animatedStyle,
        { backgroundColor: color, width: 3 + (total > 7 ? 0 : 1) },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  bar: {
    borderRadius: 4,
    minHeight: 4,
  },
});
