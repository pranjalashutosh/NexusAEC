/**
 * Push-to-Talk Button Component
 */

import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Animated } from 'react-native';

import { useLiveKit } from '../hooks/useLiveKit';
import { useTheme } from '../hooks/useTheme';

interface PTTButtonProps {
  size?: number;
}

export function PTTButton({ size = 80 }: PTTButtonProps): React.JSX.Element {
  const { colors } = useTheme();
  const { sendMessage, isMicEnabled } = useLiveKit();
  const [isPressed, setIsPressed] = useState(false);
  const [scale] = useState(new Animated.Value(1));

  const handlePressIn = () => {
    setIsPressed(true);
    Animated.spring(scale, {
      toValue: 0.95,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    setIsPressed(false);
    Animated.spring(scale, {
      toValue: 1,
      useNativeDriver: true,
    }).start();
    
    // In a real app, this would enable the mic track
    // For now, just send a message
    sendMessage('PTT activated');
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
        disabled={!isMicEnabled}
        style={[
          styles.button,
          buttonSize,
          {
            backgroundColor: isPressed ? colors.primary : colors.card,
            borderColor: colors.primary,
            opacity: isMicEnabled ? 1 : 0.5,
          },
        ]}
      >
        <View
          style={[
            styles.innerCircle,
            innerSize,
            {
              backgroundColor: isPressed ? '#FFFFFF' : colors.primary,
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
