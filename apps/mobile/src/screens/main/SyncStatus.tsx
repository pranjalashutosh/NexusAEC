/**
 * Sync Status Screen
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';


export function SyncStatusScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const { accounts } = useAuth();

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {/* Overall Status */}
        <View style={[styles.statusCard, { backgroundColor: colors.success + '15', borderColor: colors.success }]}>
          <Text style={styles.statusIcon}>✓</Text>
          <Text style={[styles.statusTitle, { color: colors.success }]}>All Synced</Text>
          <Text style={[styles.statusSubtitle, { color: colors.textSecondary }]}>
            Last sync: 2 minutes ago
          </Text>
        </View>

        {/* Account Status */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Accounts</Text>
          {accounts.map((account) => (
            <View
              key={account.id}
              style={[styles.accountCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            >
              <View style={styles.accountHeader}>
                <Text style={styles.accountIcon}>{account.provider === 'google' ? '📧' : '📨'}</Text>
                <View style={styles.accountInfo}>
                  <Text style={[styles.accountEmail, { color: colors.text }]}>{account.email}</Text>
                  <Text style={[styles.accountStatus, { color: colors.success }]}>Connected</Text>
                </View>
              </View>
              <View style={styles.syncDetails}>
                <SyncDetail label="Emails synced" value="1,234" colors={colors} />
                <SyncDetail label="Last sync" value="2m ago" colors={colors} />
                <SyncDetail label="Calendar" value="Synced" colors={colors} />
              </View>
            </View>
          ))}
        </View>

        {/* Sync History */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Recent Syncs</Text>
          <View style={[styles.historyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <HistoryItem time="2 min ago" status="success" message="Full sync completed" colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <HistoryItem time="1 hour ago" status="success" message="Incremental sync" colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <HistoryItem time="3 hours ago" status="success" message="Full sync completed" colors={colors} />
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

interface SyncDetailProps {
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['colors'];
}

function SyncDetail({ label, value, colors }: SyncDetailProps): React.JSX.Element {
  return (
    <View style={styles.syncDetailItem}>
      <Text style={[styles.syncDetailLabel, { color: colors.muted }]}>{label}</Text>
      <Text style={[styles.syncDetailValue, { color: colors.text }]}>{value}</Text>
    </View>
  );
}

interface HistoryItemProps {
  time: string;
  status: 'success' | 'error';
  message: string;
  colors: ReturnType<typeof useTheme>['colors'];
}

function HistoryItem({ time, status, message, colors }: HistoryItemProps): React.JSX.Element {
  return (
    <View style={styles.historyItem}>
      <Text style={[styles.historyDot, { color: status === 'success' ? colors.success : colors.error }]}>●</Text>
      <View style={styles.historyInfo}>
        <Text style={[styles.historyMessage, { color: colors.text }]}>{message}</Text>
        <Text style={[styles.historyTime, { color: colors.muted }]}>{time}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  statusCard: { padding: 24, borderRadius: 12, borderWidth: 1, alignItems: 'center', marginBottom: 24 },
  statusIcon: { fontSize: 32, marginBottom: 8 },
  statusTitle: { fontSize: 20, fontWeight: '700' },
  statusSubtitle: { fontSize: 14, marginTop: 4 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginBottom: 12, marginLeft: 4 },
  accountCard: { borderRadius: 12, borderWidth: 1, padding: 16, marginBottom: 12 },
  accountHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  accountIcon: { fontSize: 28, marginRight: 12 },
  accountInfo: { flex: 1 },
  accountEmail: { fontSize: 16, fontWeight: '500' },
  accountStatus: { fontSize: 13, marginTop: 2 },
  syncDetails: { flexDirection: 'row', justifyContent: 'space-between' },
  syncDetailItem: { alignItems: 'center' },
  syncDetailLabel: { fontSize: 12, marginBottom: 4 },
  syncDetailValue: { fontSize: 14, fontWeight: '600' },
  historyCard: { borderRadius: 12, borderWidth: 1, padding: 16 },
  historyItem: { flexDirection: 'row', alignItems: 'center' },
  historyDot: { fontSize: 10, marginRight: 12 },
  historyInfo: { flex: 1 },
  historyMessage: { fontSize: 14 },
  historyTime: { fontSize: 12, marginTop: 2 },
  divider: { height: 1, marginVertical: 12 },
});
