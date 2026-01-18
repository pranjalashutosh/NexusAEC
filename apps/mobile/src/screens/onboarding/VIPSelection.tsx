/**
 * VIP Selection Screen
 *
 * Select important contacts
 */

import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RootStackScreenProps } from '../../types/navigation';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';

type Props = RootStackScreenProps<'VIPSelection'>;

interface Contact {
  id: string;
  name: string;
  email: string;
  frequency: number; // Email frequency
}

// Mock suggested contacts
const SUGGESTED_CONTACTS: Contact[] = [
  { id: '1', name: 'Sarah Johnson', email: 'sarah.johnson@company.com', frequency: 45 },
  { id: '2', name: 'Michael Chen', email: 'michael.chen@company.com', frequency: 38 },
  { id: '3', name: 'Emily Davis', email: 'emily.davis@partner.com', frequency: 32 },
  { id: '4', name: 'James Wilson', email: 'james@client.com', frequency: 28 },
  { id: '5', name: 'Lisa Anderson', email: 'lisa.anderson@company.com', frequency: 25 },
  { id: '6', name: 'Robert Brown', email: 'robert.brown@vendor.com', frequency: 22 },
  { id: '7', name: 'Jennifer Taylor', email: 'jennifer@partner.com', frequency: 20 },
  { id: '8', name: 'David Martinez', email: 'david.m@client.com', frequency: 18 },
];

export function VIPSelectionScreen({ navigation }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { updatePreferences } = useAuth();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState('');

  const toggleVIP = (id: string) => {
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
    const selectedEmails = SUGGESTED_CONTACTS
      .filter((c) => selectedIds.has(c.id))
      .map((c) => c.email);
    
    await updatePreferences({ vips: selectedEmails });
    navigation.navigate('TopicSelection');
  };

  const handleSkip = () => {
    navigation.navigate('TopicSelection');
  };

  const filteredContacts = SUGGESTED_CONTACTS.filter(
    (c) =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={[styles.title, { color: colors.text }]}>
            Who's Important?
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Emails from VIPs will always be prioritized in your briefings
          </Text>
        </View>

        {/* Search */}
        <View style={[styles.searchContainer, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={[styles.searchInput, { color: colors.text }]}
            placeholder="Search contacts..."
            placeholderTextColor={colors.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {/* Contact List */}
        <FlatList
          data={filteredContacts}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[
                styles.contactItem,
                { borderColor: colors.border },
                selectedIds.has(item.id) && { backgroundColor: colors.primary + '15', borderColor: colors.primary },
              ]}
              onPress={() => toggleVIP(item.id)}
              activeOpacity={0.8}
            >
              <View style={[styles.avatar, { backgroundColor: colors.card }]}>
                <Text style={[styles.avatarText, { color: colors.text }]}>
                  {item.name.charAt(0)}
                </Text>
              </View>
              <View style={styles.contactInfo}>
                <Text style={[styles.contactName, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.contactEmail, { color: colors.textSecondary }]}>
                  {item.email}
                </Text>
              </View>
              {selectedIds.has(item.id) && (
                <Text style={[styles.checkmark, { color: colors.primary }]}>✓</Text>
              )}
            </TouchableOpacity>
          )}
        />

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={[styles.selectedCount, { color: colors.textSecondary }]}>
            {selectedIds.size} VIP{selectedIds.size !== 1 ? 's' : ''} selected
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 16,
  },
  searchIcon: {
    fontSize: 16,
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  listContent: {
    paddingBottom: 16,
  },
  contactItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    fontSize: 18,
    fontWeight: '600',
  },
  contactInfo: {
    flex: 1,
  },
  contactName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 2,
  },
  contactEmail: {
    fontSize: 14,
  },
  checkmark: {
    fontSize: 20,
    fontWeight: '700',
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
