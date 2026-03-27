import React, { useEffect } from 'react';
import { Pressable, View, ActivityIndicator } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  Easing,
  cancelAnimation,
} from 'react-native-reanimated';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '../constants/theme';

interface MicButtonProps {
  isRecording: boolean;
  isLoading: boolean;
  onPress: () => void;
  disabled?: boolean;
  size?: number;
}

export function MicButton({
  isRecording,
  isLoading,
  onPress,
  disabled = false,
  size = 88,
}: MicButtonProps) {
  const pulseScale = useSharedValue(1);
  const pulseOpacity = useSharedValue(0);

  // Pulse ring animation when recording
  useEffect(() => {
    if (isRecording) {
      pulseScale.value = 1;
      pulseOpacity.value = 0.6;

      pulseScale.value = withRepeat(
        withSequence(
          withTiming(1.5, {
            duration: 700,
            easing: Easing.out(Easing.ease),
          }),
          withTiming(1, {
            duration: 700,
            easing: Easing.in(Easing.ease),
          }),
        ),
        -1,
        false,
      );

      pulseOpacity.value = withRepeat(
        withSequence(
          withTiming(0, { duration: 700, easing: Easing.out(Easing.ease) }),
          withTiming(0.6, { duration: 700, easing: Easing.in(Easing.ease) }),
        ),
        -1,
        false,
      );
    } else {
      cancelAnimation(pulseScale);
      cancelAnimation(pulseOpacity);
      pulseScale.value = withTiming(1, { duration: 200 });
      pulseOpacity.value = withTiming(0, { duration: 200 });
    }
  }, [isRecording]);

  const pulseRingStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulseScale.value }],
    opacity: pulseOpacity.value,
  }));

  const iconName = isRecording ? 'microphone' : 'microphone-outline';
  const buttonBg = isRecording ? Colors.red[500] : Colors.brand[600];
  const ringColor = isRecording ? Colors.red[500] : Colors.brand[400];

  return (
    <View
      style={{
        width: size * 1.8,
        height: size * 1.8,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Pulsing outer ring */}
      <Animated.View
        style={[
          {
            position: 'absolute',
            width: size + 24,
            height: size + 24,
            borderRadius: (size + 24) / 2,
            backgroundColor: ringColor,
          },
          pulseRingStyle,
        ]}
      />

      {/* Second pulse ring (offset timing) */}
      {isRecording && (
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: size + 12,
              height: size + 12,
              borderRadius: (size + 12) / 2,
              backgroundColor: ringColor,
              opacity: 0.4,
            },
            pulseRingStyle,
          ]}
        />
      )}

      {/* Main button */}
      <Pressable
        onPress={onPress}
        disabled={disabled || isLoading}
        style={({ pressed }) => ({
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: buttonBg,
          alignItems: 'center',
          justifyContent: 'center',
          opacity: pressed || disabled ? 0.8 : 1,
          shadowColor: buttonBg,
          shadowOffset: { width: 0, height: 4 },
          shadowOpacity: 0.4,
          shadowRadius: 12,
          elevation: 8,
        })}
      >
        {isLoading ? (
          <ActivityIndicator color={Colors.white} size="large" />
        ) : (
          <MaterialCommunityIcons
            name={iconName}
            size={size * 0.42}
            color={Colors.white}
          />
        )}
      </Pressable>
    </View>
  );
}
