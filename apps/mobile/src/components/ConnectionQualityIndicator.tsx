/**
 * Connection Quality Indicator Component
 */

import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useTheme } from '../hooks/useTheme';

import type { ConnectionQuality } from '../hooks/useNetworkStatus';

interface ConnectionQualityIndicatorProps {
  quality: ConnectionQuality;
  showLabel?: boolean;
}

export function ConnectionQualityIndicator({
  quality,
  showLabel = false,
}: ConnectionQualityIndicatorProps): React.JSX.Element {
  const { colors } = useTheme();

  const getColor = () => {
    switch (quality) {
      case 'excellent':
        return colors.success;
      case 'good':
        return colors.success;
      case 'poor':
        return colors.warning;
      case 'lost':
        return colors.error;
      default:
        return colors.muted;
    }
  };

  const getLabel = () => {
    switch (quality) {
      case 'excellent':
        return 'Excellent';
      case 'good':
        return 'Good';
      case 'poor':
        return 'Poor';
      case 'lost':
        return 'Lost';
      default:
        return 'Unknown';
    }
  };

  const color = getColor();

  return (
    <View style={styles.container}>
      <View style={styles.bars}>
        <View style={[styles.bar, styles.bar1, { backgroundColor: color }]} />
        <View
          style={[
            styles.bar,
            styles.bar2,
            { backgroundColor: quality === 'poor' || quality === 'lost' ? colors.muted : color },
          ]}
        />
        <View
          style={[
            styles.bar,
            styles.bar3,
            { backgroundColor: quality === 'excellent' ? color : colors.muted },
          ]}
        />
      </View>
      {showLabel && <Text style={[styles.label, { color }]}>{getLabel()}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  bars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 2,
  },
  bar: {
    width: 4,
    borderRadius: 2,
  },
  bar1: {
    height: 6,
  },
  bar2: {
    height: 10,
  },
  bar3: {
    height: 14,
  },
  label: {
    marginLeft: 6,
    fontSize: 12,
    fontWeight: '500',
  },
});
