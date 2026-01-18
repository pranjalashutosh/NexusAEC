/**
 * Connect Account Screen
 *
 * OAuth buttons for Outlook and Gmail
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RootStackScreenProps } from '../../types/navigation';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';

type Props = RootStackScreenProps<'ConnectAccount'>;

type Provider = 'google' | 'microsoft';

export function ConnectAccountScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { connectAccount, accounts } = useAuth();
  const [connecting, setConnecting] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async (provider: Provider) => {
    try {
      setConnecting(provider);
      setError(null);
      await connectAccount(provider);
      
      // Navigate to next screen after successful connection
      navigation.navigate('VIPSelection');
    } catch (err) {
      setError(`Failed to connect ${provider === 'google' ? 'Gmail' : 'Outlook'}. Please try again.`);
    } finally {
      setConnecting(null);
    }
  };

  const handleSkip = () => {
    navigation.navigate('VIPSelection');
  };

  const hasGoogleAccount = accounts.some((a) => a.provider === 'google');
  const hasMicrosoftAccount = accounts.some((a) => a.provider === 'microsoft');

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            Connect Your Email
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Link your email accounts to get personalized briefings
          </Text>
        </View>

        {/* OAuth Buttons */}
        <View style={styles.buttons}>
          {/* Google/Gmail */}
          <TouchableOpacity
            style={[
              styles.oauthButton,
              { borderColor: colors.border },
              hasGoogleAccount && styles.connectedButton,
            ]}
            onPress={() => handleConnect('google')}
            disabled={connecting !== null || hasGoogleAccount}
            activeOpacity={0.8}
          >
            <View style={styles.oauthContent}>
              <Text style={styles.oauthIcon}>📧</Text>
              <View style={styles.oauthText}>
                <Text style={[styles.oauthTitle, { color: colors.text }]}>
                  {hasGoogleAccount ? 'Gmail Connected' : 'Continue with Gmail'}
                </Text>
                <Text style={[styles.oauthSubtitle, { color: colors.textSecondary }]}>
                  Google Workspace supported
                </Text>
              </View>
              {connecting === 'google' ? (
                <ActivityIndicator color={colors.primary} />
              ) : hasGoogleAccount ? (
                <Text style={[styles.checkmark, { color: colors.success }]}>✓</Text>
              ) : null}
            </View>
          </TouchableOpacity>

          {/* Microsoft/Outlook */}
          <TouchableOpacity
            style={[
              styles.oauthButton,
              { borderColor: colors.border },
              hasMicrosoftAccount && styles.connectedButton,
            ]}
            onPress={() => handleConnect('microsoft')}
            disabled={connecting !== null || hasMicrosoftAccount}
            activeOpacity={0.8}
          >
            <View style={styles.oauthContent}>
              <Text style={styles.oauthIcon}>📨</Text>
              <View style={styles.oauthText}>
                <Text style={[styles.oauthTitle, { color: colors.text }]}>
                  {hasMicrosoftAccount ? 'Outlook Connected' : 'Continue with Outlook'}
                </Text>
                <Text style={[styles.oauthSubtitle, { color: colors.textSecondary }]}>
                  Microsoft 365 supported
                </Text>
              </View>
              {connecting === 'microsoft' ? (
                <ActivityIndicator color={colors.primary} />
              ) : hasMicrosoftAccount ? (
                <Text style={[styles.checkmark, { color: colors.success }]}>✓</Text>
              ) : null}
            </View>
          </TouchableOpacity>
        </View>

        {/* Error Message */}
        {error && (
          <View style={[styles.errorContainer, { backgroundColor: colors.error + '20' }]}>
            <Text style={[styles.errorText, { color: colors.error }]}>{error}</Text>
          </View>
        )}

        {/* Info Text */}
        <View style={styles.infoSection}>
          <Text style={[styles.infoTitle, { color: colors.text }]}>
            What we access:
          </Text>
          <Text style={[styles.infoItem, { color: colors.textSecondary }]}>
            • Read your emails (read-only)
          </Text>
          <Text style={[styles.infoItem, { color: colors.textSecondary }]}>
            • Send emails on your behalf (with confirmation)
          </Text>
          <Text style={[styles.infoItem, { color: colors.textSecondary }]}>
            • Access calendar for context
          </Text>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          {(hasGoogleAccount || hasMicrosoftAccount) && (
            <TouchableOpacity
              style={[styles.continueButton, { backgroundColor: colors.primary }]}
              onPress={() => navigation.navigate('VIPSelection')}
              activeOpacity={0.8}
            >
              <Text style={styles.continueButtonText}>Continue</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity onPress={handleSkip} activeOpacity={0.8}>
            <Text style={[styles.skipText, { color: colors.muted }]}>
              Skip for now
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 24,
  },
  header: {
    marginBottom: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    lineHeight: 24,
  },
  buttons: {
    gap: 16,
    marginBottom: 24,
  },
  oauthButton: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  connectedButton: {
    opacity: 0.7,
  },
  oauthContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  oauthIcon: {
    fontSize: 28,
    marginRight: 16,
  },
  oauthText: {
    flex: 1,
  },
  oauthTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  oauthSubtitle: {
    fontSize: 13,
  },
  checkmark: {
    fontSize: 24,
    fontWeight: '700',
  },
  errorContainer: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  errorText: {
    fontSize: 14,
  },
  infoSection: {
    marginBottom: 40,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  infoItem: {
    fontSize: 14,
    lineHeight: 24,
  },
  footer: {
    marginTop: 'auto',
    alignItems: 'center',
    gap: 16,
  },
  continueButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  continueButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  skipText: {
    fontSize: 14,
    padding: 8,
  },
});
