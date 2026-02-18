/**
 * Briefing Room Screen
 *
 * Main voice briefing interface with LiveKit integration
 */

import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConnectionQualityIndicator } from '../../components/ConnectionQualityIndicator';
import { PTTButton } from '../../components/PTTButton';
import { useAuth } from '../../hooks/useAuth';
import { useLiveKit } from '../../hooks/useLiveKit';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { useTheme } from '../../hooks/useTheme';
import { getApiBaseUrl } from '../../config/api';
import { generateRoomName } from '../../services/livekit-token';

interface BriefingStats {
  newCount: number;
  vipCount: number;
  urgentCount: number;
}

import type { RootStackScreenProps } from '../../types/navigation';

type Props = RootStackScreenProps<'BriefingRoom'>;

export function BriefingRoomScreen({ navigation, route }: Props): React.JSX.Element {
  const { colors } = useTheme();
  const { accounts } = useAuth();
  const {
    roomState,
    participants,
    isAgentSpeaking,
    isUserSpeaking,
    isMicEnabled,
    connect,
    disconnect,
    toggleMic,
  } = useLiveKit();
  const { quality, isOffline } = useNetworkStatus();
  const [error, setError] = useState<string | null>(null);
  const [briefingStats, setBriefingStats] = useState<BriefingStats | null>(null);
  const [agentConnected, setAgentConnected] = useState(false);

  // Connect to room on mount
  const userId = accounts[0]?.id;

  // Fetch live email stats for the topic card
  const fetchBriefingStats = useCallback(async () => {
    if (!userId) return;
    try {
      const apiUrl = getApiBaseUrl();
      const response = await fetch(
        `${apiUrl}/email/stats?userId=${encodeURIComponent(userId)}`,
      );
      if (response.ok) {
        const data = (await response.json()) as { success: boolean } & BriefingStats;
        if (data.success) {
          setBriefingStats({
            newCount: data.newCount,
            vipCount: data.vipCount,
            urgentCount: data.urgentCount,
          });
        }
      }
    } catch {
      // Stats are informational — don't block briefing on failure
    }
  }, [userId]);

  useEffect(() => {
    void fetchBriefingStats();
  }, [fetchBriefingStats]);

  // Track whether the voice agent has joined the room
  useEffect(() => {
    const hasAgent = participants.some(
      (p) => !p.isLocal && (p.identity.startsWith('agent') || p.name?.toLowerCase().includes('agent')),
    );
    setAgentConnected(hasAgent);
  }, [participants]);

  useEffect(() => {
    const roomName = route.params?.roomName ?? generateRoomName();

    void connect(roomName, userId).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    });

    // Disconnect on unmount
    return () => {
      void disconnect();
    };
  }, []);

  const handleClose = () => {
    void disconnect();
    navigation.goBack();
  };

  const handleRetry = () => {
    setError(null);
    const roomName = route.params?.roomName ?? generateRoomName();
    void connect(roomName, userId).catch((err) => {
      setError(err instanceof Error ? err.message : 'Failed to connect');
    });
  };

  // Connection lost overlay
  if (isOffline || quality === 'lost') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.overlay}>
          <Text style={styles.overlayIcon}>📡</Text>
          <Text style={[styles.overlayTitle, { color: colors.text }]}>
            Connection Lost
          </Text>
          <Text style={[styles.overlaySubtitle, { color: colors.textSecondary }]}>
            Waiting for connection to restore...
          </Text>
          <ActivityIndicator color={colors.primary} style={styles.loader} />
          <TouchableOpacity
            style={[styles.closeButton, { backgroundColor: colors.card }]}
            onPress={handleClose}
          >
            <Text style={[styles.closeButtonText, { color: colors.text }]}>
              End Briefing
            </Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // Error state
  if (error || roomState === 'error') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.overlay}>
          <Text style={styles.overlayIcon}>⚠️</Text>
          <Text style={[styles.overlayTitle, { color: colors.text }]}>
            Connection Error
          </Text>
          <Text style={[styles.overlaySubtitle, { color: colors.textSecondary }]}>
            {error ?? 'Failed to connect to briefing room'}
          </Text>
          <View style={styles.errorButtons}>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: colors.primary }]}
              onPress={handleRetry}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.closeButton, { backgroundColor: colors.card }]}
              onPress={handleClose}
            >
              <Text style={[styles.closeButtonText, { color: colors.text }]}>
                Go Back
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // Connecting state
  if (roomState === 'connecting') {
    return (
      <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.overlayTitle, { color: colors.text, marginTop: 24 }]}>
            Connecting...
          </Text>
          <Text style={[styles.overlaySubtitle, { color: colors.textSecondary }]}>
            Setting up your voice briefing
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  // Connected - main UI
  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity
          style={[styles.closeIcon, { backgroundColor: colors.card }]}
          onPress={handleClose}
        >
          <Text style={[styles.closeIconText, { color: colors.text }]}>✕</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Briefing</Text>
        <ConnectionQualityIndicator quality={quality} />
      </View>

      {/* Main Content */}
      <View style={styles.mainContent}>
        {/* Agent Status */}
        <View style={styles.agentSection}>
          <View
            style={[
              styles.agentAvatar,
              { backgroundColor: isAgentSpeaking ? colors.primary : colors.card },
            ]}
          >
            <Text style={styles.agentAvatarText}>N</Text>
            {isAgentSpeaking && (
              <View style={[styles.speakingIndicator, { borderColor: colors.background }]}>
                <View style={[styles.speakingDot, { backgroundColor: colors.success }]} />
              </View>
            )}
          </View>
          <Text style={[styles.agentName, { color: colors.text }]}>Nexus</Text>
          <Text style={[styles.agentStatus, { color: colors.textSecondary }]}>
            {isAgentSpeaking
              ? 'Speaking...'
              : isUserSpeaking
              ? 'Listening...'
              : agentConnected
              ? 'Ready'
              : 'Waiting for agent...'}
          </Text>
        </View>

        {/* Email Briefing Overview */}
        <View style={[styles.topicCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {briefingStats ? (
            <>
              <Text style={[styles.topicLabel, { color: colors.muted }]}>Email Briefing</Text>
              <Text style={[styles.topicName, { color: colors.text }]}>
                {briefingStats.newCount} unread
              </Text>
              <Text style={[styles.topicProgress, { color: colors.textSecondary }]}>
                {briefingStats.vipCount} VIP · {briefingStats.urgentCount} urgent
              </Text>
            </>
          ) : (
            <>
              <Text style={[styles.topicLabel, { color: colors.muted }]}>Email Briefing</Text>
              <ActivityIndicator size="small" color={colors.textSecondary} />
            </>
          )}
        </View>
      </View>

      {/* Bottom Controls */}
      <View style={styles.controls}>
        {/* Mic Toggle */}
        <TouchableOpacity
          style={[
            styles.micButton,
            { backgroundColor: isMicEnabled ? colors.card : colors.error },
          ]}
          onPress={toggleMic}
        >
          <Text style={styles.micButtonIcon}>{isMicEnabled ? '🎤' : '🔇'}</Text>
        </TouchableOpacity>

        {/* PTT Button */}
        <PTTButton />

        {/* End Briefing */}
        <TouchableOpacity
          style={[styles.endButton, { backgroundColor: colors.card }]}
          onPress={handleClose}
        >
          <Text style={styles.endButtonIcon}>⏹️</Text>
        </TouchableOpacity>
      </View>

      {/* Quick Commands */}
      <View style={styles.quickCommands}>
        <QuickCommand label="Skip" icon="⏭️" colors={colors} />
        <QuickCommand label="Repeat" icon="🔄" colors={colors} />
        <QuickCommand label="Flag" icon="🚩" colors={colors} />
        <QuickCommand label="Mute" icon="🔕" colors={colors} />
      </View>
    </SafeAreaView>
  );
}

interface QuickCommandProps {
  label: string;
  icon: string;
  colors: ReturnType<typeof useTheme>['colors'];
}

function QuickCommand({ label, icon, colors }: QuickCommandProps): React.JSX.Element {
  return (
    <TouchableOpacity style={[styles.quickCommand, { backgroundColor: colors.card }]}>
      <Text style={styles.quickCommandIcon}>{icon}</Text>
      <Text style={[styles.quickCommandLabel, { color: colors.text }]}>{label}</Text>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  closeIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  closeIconText: {
    fontSize: 18,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '600',
  },
  mainContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  agentSection: {
    alignItems: 'center',
    marginBottom: 40,
  },
  agentAvatar: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  agentAvatarText: {
    fontSize: 48,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  speakingIndicator: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 3,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  speakingDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  agentName: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 4,
  },
  agentStatus: {
    fontSize: 16,
  },
  topicCard: {
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
  },
  topicLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  topicName: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  topicProgress: {
    fontSize: 14,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 24,
    paddingVertical: 24,
  },
  micButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  micButtonIcon: {
    fontSize: 24,
  },
  endButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    justifyContent: 'center',
    alignItems: 'center',
  },
  endButtonIcon: {
    fontSize: 24,
  },
  quickCommands: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
    paddingBottom: 24,
  },
  quickCommand: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickCommandIcon: {
    fontSize: 14,
  },
  quickCommandLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  overlayIcon: {
    fontSize: 64,
    marginBottom: 24,
  },
  overlayTitle: {
    fontSize: 24,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  overlaySubtitle: {
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
  },
  loader: {
    marginBottom: 24,
  },
  errorButtons: {
    gap: 12,
    width: '100%',
  },
  retryButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  closeButton: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  closeButtonText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
