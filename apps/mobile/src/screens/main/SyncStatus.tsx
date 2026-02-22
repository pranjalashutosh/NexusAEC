/**
 * Sync Status Screen
 *
 * Shows real email sync status fetched from the backend API.
 */

import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';

import { getApiBaseUrl } from '../../config/api';
import { useAuth, type AccountTokenStatus } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';

interface AccountSyncInfo {
  accountId: string;
  newCount: number;
  lastSyncedAt: Date;
  error: string | null;
}

export function SyncStatusScreen(): React.JSX.Element {
  const { colors } = useTheme();
  const { accounts, accountStatuses } = useAuth();
  const [syncInfo, setSyncInfo] = useState<Record<string, AccountSyncInfo>>({});
  const [loading, setLoading] = useState(true);

  const fetchSyncStatus = useCallback(async () => {
    setLoading(true);
    const apiUrl = getApiBaseUrl();
    const info: Record<string, AccountSyncInfo> = {};

    for (const account of accounts) {
      const status: AccountTokenStatus = accountStatuses[account.id] ?? 'checking';
      if (status !== 'valid') {
        info[account.id] = {
          accountId: account.id,
          newCount: 0,
          lastSyncedAt: new Date(),
          error: 'Tokens expired — reconnect needed',
        };
        continue;
      }

      try {
        const response = await fetch(
          `${apiUrl}/email/stats?userId=${encodeURIComponent(account.id)}`,
          { headers: { Accept: 'application/json' } }
        );

        if (response.ok) {
          const data = (await response.json()) as {
            success: boolean;
            newCount: number;
          };
          info[account.id] = {
            accountId: account.id,
            newCount: data.success ? data.newCount : 0,
            lastSyncedAt: new Date(),
            error: null,
          };
        } else {
          info[account.id] = {
            accountId: account.id,
            newCount: 0,
            lastSyncedAt: new Date(),
            error: `Server error (${response.status})`,
          };
        }
      } catch {
        info[account.id] = {
          accountId: account.id,
          newCount: 0,
          lastSyncedAt: new Date(),
          error: 'Unable to reach server',
        };
      }
    }

    setSyncInfo(info);
    setLoading(false);
  }, [accounts, accountStatuses]);

  useEffect(() => {
    void fetchSyncStatus();
  }, [fetchSyncStatus]);

  const allValid = accounts.length > 0 && accounts.every((a) => !syncInfo[a.id]?.error);
  const hasErrors = accounts.some((a) => syncInfo[a.id]?.error);

  const overallColor = loading ? colors.textSecondary : hasErrors ? colors.error : colors.success;
  const overallIcon = loading ? '...' : hasErrors ? '!' : '✓';
  const overallTitle = loading ? 'Checking...' : hasErrors ? 'Sync Issues' : 'All Synced';

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {/* Overall Status */}
        <View
          style={[
            styles.statusCard,
            { backgroundColor: overallColor + '15', borderColor: overallColor },
          ]}
        >
          <Text style={styles.statusIcon}>{overallIcon}</Text>
          <Text style={[styles.statusTitle, { color: overallColor }]}>{overallTitle}</Text>
          {!loading && allValid && (
            <Text style={[styles.statusSubtitle, { color: colors.textSecondary }]}>Just now</Text>
          )}
        </View>

        {/* Account Status */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Accounts</Text>
          {accounts.map((account) => {
            const info = syncInfo[account.id];
            const tokenStatus: AccountTokenStatus = accountStatuses[account.id] ?? 'checking';
            const hasError = !!info?.error;
            const statusColor = hasError ? colors.error : colors.success;
            const statusLabel =
              tokenStatus === 'checking'
                ? 'Checking...'
                : tokenStatus === 'expired'
                  ? 'Reconnect needed'
                  : hasError
                    ? info.error
                    : 'Connected';

            return (
              <View
                key={account.id}
                style={[
                  styles.accountCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}
              >
                <View style={styles.accountHeader}>
                  <Text style={styles.accountIcon}>
                    {account.provider === 'google' ? '📧' : '📨'}
                  </Text>
                  <View style={styles.accountInfo}>
                    <Text style={[styles.accountEmail, { color: colors.text }]}>
                      {account.email}
                    </Text>
                    <Text style={[styles.accountStatus, { color: statusColor }]}>
                      {statusLabel}
                    </Text>
                  </View>
                </View>
                <View style={styles.syncDetails}>
                  <SyncDetail
                    label="Unread emails"
                    value={loading ? '...' : String(info?.newCount ?? 0)}
                    colors={colors}
                  />
                  <SyncDetail
                    label="Last check"
                    value={loading ? '...' : info ? formatTimeAgo(info.lastSyncedAt) : '-'}
                    colors={colors}
                  />
                  <SyncDetail
                    label="Status"
                    value={loading ? '...' : hasError ? 'Error' : 'OK'}
                    colors={colors}
                  />
                </View>
              </View>
            );
          })}
        </View>

        {/* Loading indicator */}
        {loading && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
              Fetching email stats...
            </Text>
          </View>
        )}
      </View>
    </ScrollView>
  );
}

function formatTimeAgo(date: Date): string {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) {
    return 'Just now';
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes}m ago`;
  }
  const hours = Math.floor(minutes / 60);
  return `${hours}h ago`;
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

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  statusCard: {
    padding: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    marginBottom: 24,
  },
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
  loadingContainer: { alignItems: 'center', padding: 24 },
  loadingText: { marginTop: 8, fontSize: 14 },
});
