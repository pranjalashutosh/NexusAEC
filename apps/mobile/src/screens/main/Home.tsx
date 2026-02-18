/**
 * Home Screen
 *
 * Main dashboard with quick access to briefing
 */

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';

import { ConnectionQualityIndicator } from '../../components/ConnectionQualityIndicator';
import { useAuth, type AccountTokenStatus } from '../../hooks/useAuth';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useTheme } from '../../hooks/useTheme';

import { getApiBaseUrl } from '../../config/api';

import type { RootStackScreenProps } from '../../types/navigation';

type Props = RootStackScreenProps<'Home'>;

interface EmailStats {
  newCount: number;
  vipCount: number;
  urgentCount: number;
}

export function HomeScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { accounts, accountStatuses, preferences, reconnectAccount } = useAuth();
  const [reconnecting, setReconnecting] = useState<string | null>(null);
  const { quality } = useNetworkStatus();
  const [emailStats, setEmailStats] = useState<EmailStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  const userId = accounts[0]?.id;
  const hasValidAccount = userId && accountStatuses[userId] === 'valid';

  const fetchEmailStats = useCallback(async () => {
    if (!userId || !hasValidAccount) return;

    setStatsLoading(true);
    try {
      const vips = preferences.vips.length > 0
        ? `&vips=${encodeURIComponent(preferences.vips.join(','))}`
        : '';
      const apiUrl = getApiBaseUrl();
      const response = await fetch(
        `${apiUrl}/email/stats?userId=${encodeURIComponent(userId)}${vips}`,
      );

      if (response.ok) {
        const data = (await response.json()) as { success: boolean } & EmailStats;
        if (data.success) {
          setEmailStats({
            newCount: data.newCount,
            vipCount: data.vipCount,
            urgentCount: data.urgentCount,
          });
        }
      } else {
        console.warn('Email stats fetch failed:', response.status);
      }
    } catch (error) {
      console.warn('Email stats fetch error:', error);
    } finally {
      setStatsLoading(false);
    }
  }, [userId, hasValidAccount, preferences.vips]);

  // Fetch stats when account becomes valid (e.g. after reconnect)
  useEffect(() => {
    void fetchEmailStats();
  }, [fetchEmailStats]);

  // Re-fetch stats when screen gains focus
  useFocusEffect(
    useCallback(() => {
      void fetchEmailStats();
    }, [fetchEmailStats]),
  );

  const handleStartBriefing = () => {
    navigation.navigate('BriefingRoom', {});
  };

  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) {
      return 'Good morning';
    }
    if (hour < 17) {
      return 'Good afternoon';
    }
    return 'Good evening';
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTop}>
            <View>
              <Text style={[styles.greeting, { color: colors.textSecondary }]}>
                {getGreeting()}
              </Text>
              <Text style={[styles.title, { color: colors.text }]}>
                Ready for your briefing?
              </Text>
            </View>
            <ConnectionQualityIndicator quality={quality} />
          </View>
        </View>

        {/* Start Briefing Card */}
        <TouchableOpacity
          style={[styles.briefingCard, { backgroundColor: colors.primary }]}
          onPress={handleStartBriefing}
          activeOpacity={0.9}
        >
          <View style={styles.briefingCardContent}>
            <View style={styles.micIcon}>
              <Text style={styles.micIconText}>🎙️</Text>
            </View>
            <View style={styles.briefingCardText}>
              <Text style={styles.briefingCardTitle}>Start Briefing</Text>
              <Text style={styles.briefingCardSubtitle}>
                Tap to begin your voice-powered email review
              </Text>
            </View>
          </View>
          <View style={styles.briefingStats}>
            {statsLoading ? (
              <View style={styles.statsLoadingContainer}>
                <ActivityIndicator color="#FFFFFF" size="small" />
              </View>
            ) : (
              <>
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{emailStats?.newCount ?? 0}</Text>
                  <Text style={styles.statLabel}>New</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{emailStats?.vipCount ?? 0}</Text>
                  <Text style={styles.statLabel}>VIP</Text>
                </View>
                <View style={styles.statDivider} />
                <View style={styles.statItem}>
                  <Text style={styles.statValue}>{emailStats?.urgentCount ?? 0}</Text>
                  <Text style={styles.statLabel}>Urgent</Text>
                </View>
              </>
            )}
          </View>
        </TouchableOpacity>

        {/* Quick Actions */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Actions</Text>
          <View style={styles.quickActions}>
            <QuickAction
              icon="⚙️"
              label="Settings"
              onPress={() => navigation.navigate('Settings')}
              colors={colors}
            />
            <QuickAction
              icon="📊"
              label="Sync Status"
              onPress={() => navigation.navigate('SyncStatus')}
              colors={colors}
            />
            <QuickAction
              icon="⏳"
              label="Pending"
              onPress={() => navigation.navigate('PendingActions')}
              colors={colors}
            />
            <QuickAction
              icon="🔒"
              label="Privacy"
              onPress={() => navigation.navigate('PrivacyDashboard')}
              colors={colors}
            />
          </View>
        </View>

        {/* Connected Accounts */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Accounts</Text>
          <View style={[styles.accountsCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {accounts.map((account) => {
              const status: AccountTokenStatus = accountStatuses[account.id] ?? 'checking';
              const isExpired = status === 'expired';
              const statusLabel = status === 'checking' ? 'Checking...'
                : status === 'valid' ? 'Synced'
                : 'Reconnect needed';
              const statusColor = isExpired ? colors.error : colors.success;

              return (
                <TouchableOpacity
                  key={account.id}
                  style={styles.accountItem}
                  disabled={!isExpired || reconnecting === account.id}
                  onPress={async () => {
                    if (!isExpired) return;
                    setReconnecting(account.id);
                    try {
                      await reconnectAccount(account);
                    } catch (err) {
                      console.error('Reconnect failed:', err);
                    } finally {
                      setReconnecting(null);
                    }
                  }}
                  activeOpacity={isExpired ? 0.7 : 1}
                >
                  <Text style={styles.accountIcon}>
                    {account.provider === 'google' ? '📧' : '📨'}
                  </Text>
                  <View style={styles.accountInfo}>
                    <Text style={[styles.accountEmail, { color: colors.text }]}>
                      {account.email}
                    </Text>
                    <Text style={[styles.accountStatus, { color: statusColor }]}>
                      {reconnecting === account.id ? 'Reconnecting...' : statusLabel}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
            <TouchableOpacity
              style={[styles.addAccountButton, { borderColor: colors.border }]}
              onPress={() => navigation.navigate('AddAccount')}
            >
              <Text style={[styles.addAccountText, { color: colors.primary }]}>
                + Add Account
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* VIP Summary */}
        {preferences.vips.length > 0 && (
          <View style={styles.section}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>VIP Contacts</Text>
            <View style={styles.vipList}>
              {preferences.vips.slice(0, 4).map((vip, index) => (
                <View
                  key={index}
                  style={[styles.vipChip, { backgroundColor: colors.card, borderColor: colors.border }]}
                >
                  <Text style={[styles.vipName, { color: colors.text }]}>
                    {vip.split('@')[0]}
                  </Text>
                </View>
              ))}
              {preferences.vips.length > 4 && (
                <Text style={[styles.vipMore, { color: colors.muted }]}>
                  +{preferences.vips.length - 4} more
                </Text>
              )}
            </View>
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

interface QuickActionProps {
  icon: string;
  label: string;
  onPress: () => void;
  colors: ReturnType<typeof useTheme>['colors'];
}

function QuickAction({ icon, label, onPress, colors }: QuickActionProps): React.JSX.Element {
  return (
    <TouchableOpacity
      style={[styles.quickAction, { backgroundColor: colors.card, borderColor: colors.border }]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <Text style={styles.quickActionIcon}>{icon}</Text>
      <Text style={[styles.quickActionLabel, { color: colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 24,
  },
  header: {
    marginBottom: 24,
  },
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  greeting: {
    fontSize: 16,
    marginBottom: 4,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
  },
  briefingCard: {
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
  },
  briefingCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  micIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  micIconText: {
    fontSize: 28,
  },
  briefingCardText: {
    flex: 1,
  },
  briefingCardTitle: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  briefingCardSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
  },
  briefingStats: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    padding: 16,
  },
  statsLoadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 8,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  statLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginTop: 4,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  quickActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  quickAction: {
    width: '47%',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  quickActionIcon: {
    fontSize: 24,
    marginBottom: 8,
  },
  quickActionLabel: {
    fontSize: 14,
    fontWeight: '500',
  },
  accountsCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  accountItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  accountIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  accountInfo: {
    flex: 1,
  },
  accountEmail: {
    fontSize: 14,
    fontWeight: '500',
  },
  accountStatus: {
    fontSize: 12,
    marginTop: 2,
  },
  addAccountButton: {
    borderTopWidth: 1,
    paddingTop: 12,
    marginTop: 4,
    alignItems: 'center',
  },
  addAccountText: {
    fontSize: 14,
    fontWeight: '500',
  },
  vipList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    alignItems: 'center',
  },
  vipChip: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 16,
    borderWidth: 1,
  },
  vipName: {
    fontSize: 13,
    fontWeight: '500',
  },
  vipMore: {
    fontSize: 13,
    marginLeft: 4,
  },
});
