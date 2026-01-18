/**
 * Keyword Selection Screen
 *
 * Select keywords to track
 */

import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../hooks/useAuth';
import { useTheme } from '../../hooks/useTheme';

import type { RootStackScreenProps } from '../../types/navigation';

type Props = RootStackScreenProps<'KeywordSelection'>;

// Default keywords
const DEFAULT_KEYWORDS = [
  'urgent',
  'ASAP',
  'deadline',
  'approval',
  'review',
  'action required',
  'FYI',
  'follow up',
];

export function KeywordSelectionScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { updatePreferences } = useAuth();
  const [selectedKeywords, setSelectedKeywords] = useState<Set<string>>(new Set(DEFAULT_KEYWORDS));
  const [newKeyword, setNewKeyword] = useState('');

  const toggleKeyword = (keyword: string) => {
    setSelectedKeywords((prev) => {
      const next = new Set(prev);
      if (next.has(keyword)) {
        next.delete(keyword);
      } else {
        next.add(keyword);
      }
      return next;
    });
  };

  const addKeyword = () => {
    const trimmed = newKeyword.trim();
    if (trimmed && !selectedKeywords.has(trimmed)) {
      setSelectedKeywords((prev) => new Set([...prev, trimmed]));
      setNewKeyword('');
    }
  };

  const handleContinue = async () => {
    await updatePreferences({ keywords: Array.from(selectedKeywords) });
    navigation.navigate('Confirmation');
  };

  const handleSkip = () => {
    navigation.navigate('Confirmation');
  };

  const allKeywords = Array.from(new Set([...DEFAULT_KEYWORDS, ...selectedKeywords]));

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            Keyword Alerts
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Get notified when these words appear in your emails
          </Text>
        </View>

        {/* Add Keyword */}
        <View style={[styles.addContainer, { borderColor: colors.border }]}>
          <TextInput
            style={[styles.addInput, { color: colors.text }]}
            placeholder="Add a keyword..."
            placeholderTextColor={colors.muted}
            value={newKeyword}
            onChangeText={setNewKeyword}
            onSubmitEditing={addKeyword}
            returnKeyType="done"
          />
          <TouchableOpacity
            style={[styles.addButton, { backgroundColor: colors.primary }]}
            onPress={addKeyword}
            activeOpacity={0.8}
          >
            <Text style={styles.addButtonText}>+</Text>
          </TouchableOpacity>
        </View>

        {/* Keywords */}
        <ScrollView
          contentContainerStyle={styles.keywordsContainer}
          showsVerticalScrollIndicator={false}
        >
          {allKeywords.map((keyword) => (
            <TouchableOpacity
              key={keyword}
              style={[
                styles.keywordChip,
                { borderColor: colors.border },
                selectedKeywords.has(keyword) && {
                  backgroundColor: colors.secondary + '15',
                  borderColor: colors.secondary,
                },
              ]}
              onPress={() => toggleKeyword(keyword)}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.keywordText,
                  { color: selectedKeywords.has(keyword) ? colors.secondary : colors.text },
                ]}
              >
                {keyword}
              </Text>
              {selectedKeywords.has(keyword) && (
                <Text style={[styles.removeIcon, { color: colors.secondary }]}>×</Text>
              )}
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.selectedCount, { color: colors.textSecondary }]}>
            {selectedKeywords.size} keyword{selectedKeywords.size !== 1 ? 's' : ''} selected
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
  addContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 12,
    marginBottom: 24,
    overflow: 'hidden',
  },
  addInput: {
    flex: 1,
    fontSize: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  addButton: {
    width: 48,
    height: 48,
    justifyContent: 'center',
    alignItems: 'center',
    margin: 4,
    borderRadius: 8,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '500',
  },
  keywordsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingBottom: 24,
  },
  keywordChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 1,
  },
  keywordText: {
    fontSize: 14,
    fontWeight: '500',
  },
  removeIcon: {
    fontSize: 18,
    marginLeft: 6,
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
