/**
 * Push-to-Talk Button Component
 *
 * Press and hold to activate the microphone (push-to-talk mode).
 * Release to mute. Also works as a toggle when tapped quickly.
 */

import React, { useRef, useState } from 'react';
import { View, StyleSheet, Pressable, Animated } from 'react-native';

import { useLiveKit } from '../hooks/useLiveKit';
import { useTheme } from '../hooks/useTheme';

interface PTTButtonProps {
  size?: number;
}

export function PTTButton({ size = 80 }: PTTButtonProps): React.JSX.Element {
  const { colors } = useTheme();
  const { toggleMic, isMicEnabled, roomState } = useLiveKit();
  const [isPressed, setIsPressed] = useState(false);
  const [scale] = useState(new Animated.Value(1));
  const pressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isLongPressRef = useRef(false);

  const isConnected = roomState === 'connected';

  const handlePressIn = () => {
    setIsPressed(true);
    isLongPressRef.current = false;

    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();

    // After 300ms, treat as long-press (push-to-talk mode)
    pressTimerRef.current = setTimeout(() => {
      isLongPressRef.current = true;
      // Enable mic if currently disabled (push-to-talk)
      if (!isMicEnabled) {
        toggleMic();
      }
    }, 300);
  };

  const handlePressOut = () => {
    setIsPressed(false);

    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();

    if (pressTimerRef.current) {
      clearTimeout(pressTimerRef.current);
      pressTimerRef.current = null;
    }

    if (isLongPressRef.current) {
      // Long press release — mute mic (end push-to-talk)
      if (isMicEnabled) {
        toggleMic();
      }
    } else {
      // Quick tap — toggle mic
      toggleMic();
    }
  };

  const buttonSize = {
    width: size,
    height: size,
    borderRadius: size / 2,
  };

  const innerSize = {
    width: size * 0.7,
    height: size * 0.7,
    borderRadius: (size * 0.7) / 2,
  };

  return (
    <Animated.View style={[styles.container, { transform: [{ scale }] }]}>
      <Pressable
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={!isConnected}
        style={[
          styles.button,
          buttonSize,
          {
            backgroundColor: isPressed ? colors.primary : colors.card,
            borderColor: isMicEnabled ? colors.primary : colors.border,
            opacity: isConnected ? 1 : 0.5,
          },
        ]}
      >
        <View
          style={[
            styles.innerCircle,
            innerSize,
            {
              backgroundColor: isPressed ? '#FFFFFF' : isMicEnabled ? colors.primary : colors.muted,
            },
          ]}
        />
        {isPressed && (
          <View style={[styles.pulseRing, buttonSize, { borderColor: colors.primary }]} />
        )}
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 3,
  },
  innerCircle: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulseRing: {
    position: 'absolute',
    borderWidth: 2,
    opacity: 0.5,
  },
});
