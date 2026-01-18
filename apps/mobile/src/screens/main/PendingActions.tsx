/**
 * Pending Actions Screen
 */

import React from 'react';
import { FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useTheme } from '../../hooks/useTheme';


interface PendingAction {
  id: string;
  type: 'flag' | 'mute' | 'draft';
  description: string;
  timestamp: string;
  retries: number;
}

// Mock data
const PENDING_ACTIONS: PendingAction[] = [];

export function PendingActionsScreen(): React.JSX.Element {
  const { colors } = useTheme();

  if (PENDING_ACTIONS.length === 0) {
    return (
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>✅</Text>
          <Text style={[styles.emptyTitle, { color: colors.text }]}>All Caught Up</Text>
          <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
            No pending actions to process
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <FlatList
        data={PENDING_ACTIONS}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={[styles.actionCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.actionInfo}>
              <Text style={[styles.actionType, { color: colors.text }]}>{item.type}</Text>
              <Text style={[styles.actionDesc, { color: colors.textSecondary }]}>{item.description}</Text>
              <Text style={[styles.actionMeta, { color: colors.muted }]}>
                {item.timestamp} • {item.retries} retries
              </Text>
            </View>
            <TouchableOpacity style={[styles.retryButton, { backgroundColor: colors.primary }]}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  list: { padding: 16 },
  actionCard: { flexDirection: 'row', alignItems: 'center', padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 12 },
  actionInfo: { flex: 1 },
  actionType: { fontSize: 16, fontWeight: '600', textTransform: 'capitalize' },
  actionDesc: { fontSize: 14, marginTop: 4 },
  actionMeta: { fontSize: 12, marginTop: 4 },
  retryButton: { paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8 },
  retryButtonText: { color: '#FFFFFF', fontSize: 14, fontWeight: '600' },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyIcon: { fontSize: 64, marginBottom: 16 },
  emptyTitle: { fontSize: 24, fontWeight: '700', marginBottom: 8 },
  emptySubtitle: { fontSize: 16, textAlign: 'center' },
});
