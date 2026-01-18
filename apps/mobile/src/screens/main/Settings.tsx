/**
 * Settings Screen
 */

import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import type { RootStackScreenProps } from '../../types/navigation';
import { useTheme } from '../../hooks/useTheme';
import { useAuth } from '../../hooks/useAuth';

type Props = RootStackScreenProps<'Settings'>;

export function SettingsScreen({ navigation }: Props): React.JSX.Element {
  const { colors, isDark, toggleTheme } = useTheme();
  const { preferences, updatePreferences, logout } = useAuth();

  const handleVerbosityChange = (level: 'concise' | 'standard' | 'detailed') => {
    updatePreferences({ verbosity: level });
  };

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={styles.content}>
        {/* Preferences Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Preferences</Text>
          
          <View style={[styles.settingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            {/* Dark Mode */}
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>Dark Mode</Text>
                <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                  Use dark theme
                </Text>
              </View>
              <Switch value={isDark} onValueChange={toggleTheme} />
            </View>

            <View style={[styles.divider, { backgroundColor: colors.border }]} />

            {/* Verbosity */}
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={[styles.settingLabel, { color: colors.text }]}>Verbosity</Text>
                <Text style={[styles.settingDescription, { color: colors.textSecondary }]}>
                  Briefing detail level
                </Text>
              </View>
            </View>
            <View style={styles.verbosityOptions}>
              {(['concise', 'standard', 'detailed'] as const).map((level) => (
                <TouchableOpacity
                  key={level}
                  style={[
                    styles.verbosityOption,
                    { borderColor: colors.border },
                    preferences.verbosity === level && { backgroundColor: colors.primary + '20', borderColor: colors.primary },
                  ]}
                  onPress={() => handleVerbosityChange(level)}
                >
                  <Text style={[
                    styles.verbosityText,
                    { color: preferences.verbosity === level ? colors.primary : colors.text },
                  ]}>
                    {level.charAt(0).toUpperCase() + level.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        {/* Personalization Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Personalization</Text>
          
          <View style={[styles.settingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <SettingLink label="VIP Contacts" value={`${preferences.vips.length} contacts`} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingLink label="Topics" value={`${preferences.topics.length} topics`} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingLink label="Keywords" value={`${preferences.keywords.length} keywords`} colors={colors} />
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <SettingLink label="Muted Senders" value={`${preferences.mutedSenders.length} senders`} colors={colors} />
          </View>
        </View>

        {/* Account Section */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Account</Text>
          
          <View style={[styles.settingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TouchableOpacity style={styles.settingRow} onPress={() => navigation.navigate('AddAccount')}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Add Email Account</Text>
              <Text style={[styles.chevron, { color: colors.muted }]}>›</Text>
            </TouchableOpacity>
            <View style={[styles.divider, { backgroundColor: colors.border }]} />
            <TouchableOpacity style={styles.settingRow} onPress={() => navigation.navigate('PrivacyDashboard')}>
              <Text style={[styles.settingLabel, { color: colors.text }]}>Privacy & Data</Text>
              <Text style={[styles.chevron, { color: colors.muted }]}>›</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Logout */}
        <TouchableOpacity
          style={[styles.logoutButton, { borderColor: colors.error }]}
          onPress={logout}
        >
          <Text style={[styles.logoutText, { color: colors.error }]}>Sign Out</Text>
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

interface SettingLinkProps {
  label: string;
  value: string;
  colors: ReturnType<typeof useTheme>['colors'];
}

function SettingLink({ label, value, colors }: SettingLinkProps): React.JSX.Element {
  return (
    <TouchableOpacity style={styles.settingRow}>
      <Text style={[styles.settingLabel, { color: colors.text }]}>{label}</Text>
      <View style={styles.settingRight}>
        <Text style={[styles.settingValue, { color: colors.muted }]}>{value}</Text>
        <Text style={[styles.chevron, { color: colors.muted }]}>›</Text>
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  section: { marginBottom: 24 },
  sectionTitle: { fontSize: 14, fontWeight: '600', marginBottom: 12, marginLeft: 4 },
  settingCard: { borderRadius: 12, borderWidth: 1, overflow: 'hidden' },
  settingRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16 },
  settingInfo: { flex: 1 },
  settingLabel: { fontSize: 16 },
  settingDescription: { fontSize: 13, marginTop: 2 },
  settingRight: { flexDirection: 'row', alignItems: 'center' },
  settingValue: { fontSize: 14, marginRight: 8 },
  chevron: { fontSize: 20 },
  divider: { height: 1 },
  verbosityOptions: { flexDirection: 'row', gap: 8, paddingHorizontal: 16, paddingBottom: 16 },
  verbosityOption: { flex: 1, paddingVertical: 10, borderRadius: 8, borderWidth: 1, alignItems: 'center' },
  verbosityText: { fontSize: 14, fontWeight: '500' },
  logoutButton: { borderWidth: 1, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  logoutText: { fontSize: 16, fontWeight: '600' },
});
