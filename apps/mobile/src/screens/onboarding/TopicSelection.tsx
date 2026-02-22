/**
 * Topic Selection Screen
 *
 * Select topics of interest
 */

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';

import type { RootStackScreenProps } from '../../types/navigation';

type Props = RootStackScreenProps<'TopicSelection'>;

// Suggested topics
const SUGGESTED_TOPICS = [
  { id: '1', name: 'Project Updates', icon: '📊' },
  { id: '2', name: 'Client Communications', icon: '🤝' },
  { id: '3', name: 'Team Updates', icon: '👥' },
  { id: '4', name: 'Financial Reports', icon: '💰' },
  { id: '5', name: 'Meeting Requests', icon: '📅' },
  { id: '6', name: 'Action Items', icon: '✅' },
  { id: '7', name: 'Approvals Needed', icon: '✋' },
  { id: '8', name: 'Industry News', icon: '📰' },
  { id: '9', name: 'HR & Admin', icon: '📋' },
  { id: '10', name: 'Travel & Logistics', icon: '✈️' },
];

export function TopicSelectionScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { updatePreferences } = useAuth();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const toggleTopic = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleContinue = async () => {
    const selectedTopics = SUGGESTED_TOPICS.filter((t) => selectedIds.has(t.id)).map((t) => t.name);

    await updatePreferences({ topics: selectedTopics });
    navigation.navigate('KeywordSelection');
  };

  const handleSkip = () => {
    navigation.navigate('KeywordSelection');
  };

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>What Matters to You?</Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Select topics you want highlighted in briefings
          </Text>
        </View>

        {/* Topics Grid */}
        <ScrollView contentContainerStyle={styles.topicsGrid} showsVerticalScrollIndicator={false}>
          {SUGGESTED_TOPICS.map((topic) => (
            <TouchableOpacity
              key={topic.id}
              style={[
                styles.topicChip,
                { borderColor: colors.border },
                selectedIds.has(topic.id) && {
                  backgroundColor: colors.primary + '15',
                  borderColor: colors.primary,
                },
              ]}
              onPress={() => toggleTopic(topic.id)}
              activeOpacity={0.8}
            >
              <Text style={styles.topicIcon}>{topic.icon}</Text>
              <Text
                style={[
                  styles.topicName,
                  { color: selectedIds.has(topic.id) ? colors.primary : colors.text },
                ]}
              >
                {topic.name}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.selectedCount, { color: colors.textSecondary }]}>
            {selectedIds.size} topic{selectedIds.size !== 1 ? 's' : ''} selected
          </Text>

          <TouchableOpacity
            style={[styles.continueButton, { backgroundColor: colors.primary }]}
            onPress={handleContinue}
            activeOpacity={0.8}
          >
            <Text style={styles.continueButtonText}>Continue</Text>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleSkip} activeOpacity={0.8}>
            <Text style={[styles.skipText, { color: colors.muted }]}>Skip for now</Text>
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
    paddingTop: 24,
    paddingBottom: 24,
  },
  header: {
    marginBottom: 24,
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
  topicsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingBottom: 24,
  },
  topicChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 24,
    borderWidth: 1,
  },
  topicIcon: {
    fontSize: 18,
    marginRight: 8,
  },
  topicName: {
    fontSize: 14,
    fontWeight: '500',
  },
  footer: {
    alignItems: 'center',
    gap: 12,
    marginTop: 8,
  },
  selectedCount: {
    fontSize: 14,
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
