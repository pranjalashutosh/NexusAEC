/**
 * Add Account Screen
 */

import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';

import type { RootStackScreenProps } from '../../types/navigation';

type Props = RootStackScreenProps<'AddAccount'>;

export function AddAccountScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { connectAccount, accounts } = useAuth();
  const [connecting, setConnecting] = useState<'google' | 'microsoft' | null>(null);

  const handleConnect = async (provider: 'google' | 'microsoft') => {
    setConnecting(provider);
    try {
      await connectAccount(provider);
      navigation.goBack();
    } catch {
      // Handle error
    } finally {
      setConnecting(null);
    }
  };

  const hasGoogle = accounts.some((a) => a.provider === 'google');
  const hasMicrosoft = accounts.some((a) => a.provider === 'microsoft');

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Connect another email account
        </Text>

        <View style={styles.buttons}>
          {!hasGoogle && (
            <TouchableOpacity
              style={[styles.button, { borderColor: colors.border }]}
              onPress={() => handleConnect('google')}
              disabled={connecting !== null}
            >
              <Text style={styles.buttonIcon}>📧</Text>
              <Text style={[styles.buttonText, { color: colors.text }]}>Add Gmail</Text>
              {connecting === 'google' && <ActivityIndicator color={colors.primary} />}
            </TouchableOpacity>
          )}

          {!hasMicrosoft && (
            <TouchableOpacity
              style={[styles.button, { borderColor: colors.border }]}
              onPress={() => handleConnect('microsoft')}
              disabled={connecting !== null}
            >
              <Text style={styles.buttonIcon}>📨</Text>
              <Text style={[styles.buttonText, { color: colors.text }]}>Add Outlook</Text>
              {connecting === 'microsoft' && <ActivityIndicator color={colors.primary} />}
            </TouchableOpacity>
          )}

          {hasGoogle && hasMicrosoft && (
            <View style={styles.allConnected}>
              <Text style={styles.allConnectedIcon}>✅</Text>
              <Text style={[styles.allConnectedText, { color: colors.text }]}>
                All supported accounts connected
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 24 },
  subtitle: { fontSize: 16, marginBottom: 24 },
  buttons: { gap: 16 },
  button: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1, gap: 12 },
  buttonIcon: { fontSize: 24 },
  buttonText: { flex: 1, fontSize: 16, fontWeight: '500' },
  allConnected: { alignItems: 'center', padding: 24 },
  allConnectedIcon: { fontSize: 48, marginBottom: 16 },
  allConnectedText: { fontSize: 16, textAlign: 'center' },
});
