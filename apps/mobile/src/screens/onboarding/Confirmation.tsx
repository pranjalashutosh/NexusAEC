/**
 * Confirmation Screen
 *
 * Summary of setup and start briefing
 */

import React from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';

import type { RootStackScreenProps } from '../../types/navigation';

type Props = RootStackScreenProps<'Confirmation'>;

export function ConfirmationScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { preferences, accounts, completeOnboarding } = useAuth();

  const handleStartBriefing = async () => {
    await completeOnboarding();
    // Navigation will automatically switch to main app
  };

  const handleEditSettings = () => {
    navigation.navigate('VIPSelection');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.successIcon}>✅</Text>
          <Text style={[styles.title, { color: colors.text }]}>
            You're All Set!
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Here's a summary of your preferences
          </Text>
        </View>

        {/* Summary Cards */}
        <View style={styles.summaryCards}>
          {/* Connected Accounts */}
          <SummaryCard
            title="Connected Accounts"
            icon="📧"
            items={accounts.map((a) => a.email)}
            emptyText="No accounts connected"
            colors={colors}
          />

          {/* VIPs */}
          <SummaryCard
            title="VIP Contacts"
            icon="⭐"
            items={preferences.vips}
            emptyText="No VIPs selected"
            maxDisplay={3}
            colors={colors}
          />

          {/* Topics */}
          <SummaryCard
            title="Topics"
            icon="📂"
            items={preferences.topics}
            emptyText="All topics"
            maxDisplay={4}
            colors={colors}
          />

          {/* Keywords */}
          <SummaryCard
            title="Keywords"
            icon="🔔"
            items={preferences.keywords}
            emptyText="Default keywords"
            maxDisplay={5}
            colors={colors}
          />
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <TouchableOpacity
            style={[styles.startButton, { backgroundColor: colors.primary }]}
            onPress={handleStartBriefing}
            activeOpacity={0.8}
          >
            <Text style={styles.startButtonText}>Start My First Briefing</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleEditSettings} activeOpacity={0.8}>
            <Text style={[styles.editText, { color: colors.primary }]}>
              Edit Preferences
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

interface SummaryCardProps {
  title: string;
  icon: string;
  items: string[];
  emptyText: string;
  maxDisplay?: number;
  colors: ReturnType<typeof useTheme>['colors'];
}

function SummaryCard({
  title,
  icon,
  items,
  emptyText,
  maxDisplay = 3,
  colors,
}: SummaryCardProps): React.JSX.Element {
  const displayItems = items.slice(0, maxDisplay);
  const remaining = items.length - maxDisplay;

  return (
    <View style={[styles.summaryCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardIcon}>{icon}</Text>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
        <Text style={[styles.cardCount, { color: colors.muted }]}>
          {items.length > 0 ? items.length : ''}
        </Text>
      </View>
      <View style={styles.cardContent}>
        {items.length === 0 ? (
          <Text style={[styles.emptyText, { color: colors.muted }]}>{emptyText}</Text>
        ) : (
          <>
            {displayItems.map((item, index) => (
              <Text
                key={index}
                style={[styles.itemText, { color: colors.textSecondary }]}
                numberOfLines={1}
              >
                • {item}
              </Text>
            ))}
            {remaining > 0 && (
              <Text style={[styles.moreText, { color: colors.primary }]}>
                +{remaining} more
              </Text>
            )}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 32,
  },
  successIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 16,
    textAlign: 'center',
  },
  summaryCards: {
    gap: 16,
    marginBottom: 32,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardIcon: {
    fontSize: 20,
    marginRight: 10,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '600',
    flex: 1,
  },
  cardCount: {
    fontSize: 14,
  },
  cardContent: {
    gap: 4,
  },
  emptyText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  itemText: {
    fontSize: 14,
    lineHeight: 22,
  },
  moreText: {
    fontSize: 14,
    marginTop: 4,
  },
  footer: {
    alignItems: 'center',
    gap: 16,
  },
  startButton: {
    width: '100%',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  editText: {
    fontSize: 14,
    fontWeight: '500',
    padding: 8,
  },
});
