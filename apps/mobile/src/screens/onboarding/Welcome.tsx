/**
 * Welcome Screen
 *
 * Splash screen with value proposition
 */

import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useTheme } from '../../hooks/useTheme';

import type { RootStackScreenProps } from '../../types/navigation';

type Props = RootStackScreenProps<'Welcome'>;

export function WelcomeScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();

  const handleQuickStart = () => {
    navigation.navigate('ConnectAccount');
  };

  const handlePersonalize = () => {
    navigation.navigate('ConnectAccount');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {/* Logo/Illustration Area */}
        <View style={styles.heroSection}>
          <View style={[styles.iconContainer, { backgroundColor: colors.primary }]}>
            <Text style={styles.iconText}>N</Text>
          </View>
          <Text style={[styles.title, { color: colors.text }]}>NexusAEC</Text>
          <Text style={[styles.tagline, { color: colors.textSecondary }]}>
            Your voice-powered executive assistant
          </Text>
        </View>

        {/* Value Propositions */}
        <View style={styles.features}>
          <FeatureItem
            icon="🎙️"
            title="Hands-free briefings"
            description="Listen to your inbox while driving or walking"
            colors={colors}
          />
          <FeatureItem
            icon="⚡"
            title="Instant actions"
            description="Flag, reply, and prioritize emails with voice commands"
            colors={colors}
          />
          <FeatureItem
            icon="🧠"
            title="Smart prioritization"
            description="AI surfaces what matters most to you"
            colors={colors}
          />
        </View>

        {/* CTA Buttons */}
        <View style={styles.buttonContainer}>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: colors.primary }]}
            onPress={handleQuickStart}
            activeOpacity={0.8}
          >
            <Text style={styles.primaryButtonText}>Quick Start</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.secondaryButton, { borderColor: colors.border }]}
            onPress={handlePersonalize}
            activeOpacity={0.8}
          >
            <Text style={[styles.secondaryButtonText, { color: colors.text }]}>
              Personalize Setup
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <Text style={[styles.footerText, { color: colors.muted }]}>
          Your data stays private and secure
        </Text>
      </View>
    </SafeAreaView>
  );
}

interface FeatureItemProps {
  icon: string;
  title: string;
  description: string;
  colors: ReturnType<typeof useTheme>['colors'];
}

function FeatureItem({ icon, title, description, colors }: FeatureItemProps): React.JSX.Element {
  return (
    <View style={styles.featureItem}>
      <Text style={styles.featureIcon}>{icon}</Text>
      <View style={styles.featureText}>
        <Text style={[styles.featureTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.featureDescription, { color: colors.textSecondary }]}>
          {description}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'space-between',
    paddingTop: 40,
    paddingBottom: 24,
  },
  heroSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconContainer: {
    width: 80,
    height: 80,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  iconText: {
    fontSize: 40,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  title: {
    fontSize: 32,
    fontWeight: '700',
    marginBottom: 8,
  },
  tagline: {
    fontSize: 16,
    textAlign: 'center',
  },
  features: {
    marginBottom: 40,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  featureIcon: {
    fontSize: 24,
    marginRight: 16,
    marginTop: 2,
  },
  featureText: {
    flex: 1,
  },
  featureTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  featureDescription: {
    fontSize: 14,
    lineHeight: 20,
  },
  buttonContainer: {
    gap: 12,
  },
  primaryButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  secondaryButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  footerText: {
    textAlign: 'center',
    fontSize: 12,
    marginTop: 24,
  },
});
