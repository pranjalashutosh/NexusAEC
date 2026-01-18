/**
 * Privacy Dashboard Screen
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert } from 'react-native';

import type { RootStackScreenProps } from '../../types/navigation';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';

type Props = RootStackScreenProps<'PrivacyDashboard'>;

export function PrivacyDashboardScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { logout } = useAuth();

  const handleClearData = () => {
    Alert.alert(
      'Clear All Data',
      'This will delete all your stored data including preferences, cached emails, and sync history. This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear Data', style: 'destructive', onPress: () => logout() },
      ]
    );
  };

  const handleRevokePermissions = () => {
    Alert.alert(
      'Revoke Permissions',
      'This will disconnect all email accounts and revoke access. You can reconnect them later.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Revoke', style: 'destructive', onPress: () => logout() },
      ]
    );
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {/* Data Storage */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Data Storage</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <DataRow label="Email Cache" value="12 MB" retention="7 days" colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <DataRow label="Preferences" value="2 KB" retention="Until deleted" colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <DataRow label="Sync History" value="45 KB" retention="30 days" colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <DataRow label="Voice Transcripts" value="0 KB" retention="Not stored" colors={colors} />
          </View>
        </View>

        {/* Privacy Info */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Privacy Policy</Text>
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.infoText, { color: colors.textSecondary }]}>
              • Emails are processed in real-time and not stored long-term{'\n'}
              • Voice transcripts are processed by Deepgram and not stored{'\n'}
              • Your preferences are stored locally on your device{'\n'}
              • We do not sell or share your personal data
            </Text>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Actions</Text>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => {}}
          >
            <Text style={[styles.actionText, { color: colors.text }]}>Export My Data</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={handleRevokePermissions}
          >
            <Text style={[styles.actionText, { color: colors.warning }]}>Revoke Permissions</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { backgroundColor: colors.error + '10', borderColor: colors.error }]}
            onPress={handleClearData}
          >
            <Text style={[styles.actionText, { color: colors.error }]}>Clear My Data</Text>
          </TouchableOpacity>
        </View>
      </View>
    </ScrollView>
  );
}

interface DataRowProps {
  label: string;
  value: string;
  retention: string;
  colors: ReturnType<typeof useTheme>['colors'];
}

function DataRow({ label, value, retention, colors }: DataRowProps): React.JSX.Element {
  return (
    <View style={styles.dataRow}>
      <View style={styles.dataInfo}>
        <Text style={[styles.dataLabel, { color: colors.text }]}>{label}</Text>
        <Text style={[styles.dataRetention, { color: colors.muted }]}>Retention: {retention}</Text>
      </View>
      <Text style={[styles.dataValue, { color: colors.textSecondary }]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginBottom: 12, marginLeft: 4 },
  card: { borderRadius: 12, borderWidth: 1, padding: 16 },
  divider: { height: 1, marginVertical: 12 },
  dataRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  dataInfo: { flex: 1 },
  dataLabel: { fontSize: 15 },
  dataRetention: { fontSize: 12, marginTop: 2 },
  dataValue: { fontSize: 14 },
  infoText: { fontSize: 14, lineHeight: 22 },
  actionButton: { padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 12, alignItems: 'center' },
  actionText: { fontSize: 16, fontWeight: '500' },
});
