/**
 * LiveKit hook and provider
 *
 * Manages a real LiveKit Room connection for voice briefings.
 * Uses livekit-client Room class with the token service for authentication.
 */

import {
  AudioSession,
  AndroidAudioTypePresets,
  useIOSAudioManagement,
  type AppleAudioConfiguration,
  type AudioTrackState,
} from '@livekit/react-native';
import {
  Room,
  RoomEvent,
  ConnectionState,
  ParticipantKind,
  Track,
  type RemoteTrack,
  type RemoteTrackPublication,
  type RemoteParticipant,
} from 'livekit-client';
import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';

import { getLiveKitUrl } from '../config/api';
import { getLiveKitToken } from '../services/livekit-token';

/**
 * LiveKit room state
 */
export type RoomState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';

/**
 * LiveKit participant info
 */
export interface Participant {
  identity: string;
  name?: string;
  isLocal: boolean;
  isSpeaking: boolean;
}

/**
 * LiveKit context value
 */
interface LiveKitContextValue {
  /** Current room state */
  roomState: RoomState;
  /** Room name if connected */
  roomName: string | null;
  /** Room token */
  token: string | null;
  /** Participants in the room */
  participants: Participant[];
  /** Is the agent speaking */
  isAgentSpeaking: boolean;
  /** Is the user speaking */
  isUserSpeaking: boolean;
  /** Microphone enabled */
  isMicEnabled: boolean;
  /** Connect to a room */
  connect: (roomName: string, userId?: string, displayName?: string) => Promise<void>;
  /** Disconnect from room */
  disconnect: () => Promise<void>;
  /** Toggle microphone */
  toggleMic: () => void;
  /** Send data message to agent */
  sendMessage: (message: string) => void;
}

const LiveKitContext = createContext<LiveKitContextValue | undefined>(undefined);

// Server URL is now provided by config/api.ts via getLiveKitUrl()

/**
 * Map livekit-client ConnectionState to our RoomState
 */
function mapConnectionState(state: ConnectionState): RoomState {
  switch (state) {
    case ConnectionState.Connected:
      return 'connected';
    case ConnectionState.Connecting:
      return 'connecting';
    case ConnectionState.Reconnecting:
      return 'reconnecting';
    case ConnectionState.Disconnected:
      return 'disconnected';
    default:
      return 'disconnected';
  }
}

/**
 * Custom iOS audio configuration that includes defaultToSpeaker.
 *
 * The default getDefaultAppleAudioConfigurationForMode omits defaultToSpeaker,
 * which causes audio to route to the earpiece instead of the speaker on iPhone.
 *
 * IMPORTANT: We NEVER return 'soloAmbient'. That category cannot play WebRTC
 * audio. Even when trackState is 'none' (no tracks yet, or during reconnect),
 * we keep the session in 'playAndRecord' so incoming audio packets are never
 * silently dropped due to a category mismatch.
 */
function configureAppleAudio(
  trackState: AudioTrackState,
  preferSpeakerOutput: boolean
): AppleAudioConfiguration {
  console.log('[LiveKit] configureAppleAudio called:', { trackState, preferSpeakerOutput });

  if (trackState === 'remoteOnly') {
    // MUST use 'playAndRecord' here — NOT 'playback'.
    // iOS only allows 'defaultToSpeaker' with 'playAndRecord'.
    // Using 'playback' + 'defaultToSpeaker' causes SessionCore.mm error
    // and kills all audio output on physical devices.
    return {
      audioCategory: 'playAndRecord',
      audioCategoryOptions: preferSpeakerOutput
        ? ['allowBluetooth', 'defaultToSpeaker', 'mixWithOthers']
        : ['allowBluetooth', 'mixWithOthers'],
      audioMode: preferSpeakerOutput ? 'videoChat' : 'voiceChat',
    };
  } else if (trackState === 'localAndRemote' || trackState === 'localOnly') {
    return {
      audioCategory: 'playAndRecord',
      audioCategoryOptions: preferSpeakerOutput
        ? ['allowBluetooth', 'defaultToSpeaker', 'mixWithOthers']
        : ['allowBluetooth', 'mixWithOthers'],
      audioMode: preferSpeakerOutput ? 'videoChat' : 'voiceChat',
    };
  }

  // trackState === 'none': No tracks yet or during reconnect.
  // Stay in playAndRecord so WebRTC audio is never blocked.
  return {
    audioCategory: 'playAndRecord',
    audioCategoryOptions: preferSpeakerOutput
      ? ['allowBluetooth', 'defaultToSpeaker', 'mixWithOthers']
      : ['allowBluetooth', 'mixWithOthers'],
    audioMode: preferSpeakerOutput ? 'videoChat' : 'voiceChat',
  };
}

/**
 * LiveKit provider component
 */
export function LiveKitProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [roomState, setRoomState] = useState<RoomState>('disconnected');
  const [roomName, setRoomName] = useState<string | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [isAgentSpeaking, setIsAgentSpeaking] = useState(false);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isMicEnabled, setIsMicEnabled] = useState(true);

  // Persistent Room instance — created once so useIOSAudioManagement can
  // observe track changes across the full lifecycle.
  const [room] = useState(() => new Room());

  // Automatically configure iOS AVAudioSession as audio tracks change.
  // Pass custom config that includes defaultToSpeaker for proper speaker output.
  useIOSAudioManagement(room, true, configureAppleAudio);

  /**
   * Build participant list from the Room object
   */
  const syncParticipants = useCallback((r: Room) => {
    const parts: Participant[] = [];

    // Local participant
    const local = r.localParticipant;
    parts.push({
      identity: local.identity,
      name: local.name,
      isLocal: true,
      isSpeaking: local.isSpeaking,
    });
    setIsUserSpeaking(local.isSpeaking);

    // Remote participants
    r.remoteParticipants.forEach((remote) => {
      parts.push({
        identity: remote.identity,
        name: remote.name,
        isLocal: false,
        isSpeaking: remote.isSpeaking,
      });
    });

    setParticipants(parts);

    // Check if agent is speaking (agent identity typically starts with "agent")
    const agent = Array.from(r.remoteParticipants.values()).find(
      (p) => p.identity.startsWith('agent') || p.kind === ParticipantKind.AGENT
    );
    setIsAgentSpeaking(agent?.isSpeaking ?? false);
  }, []);

  // =========================================================================
  // Attach room event listeners ONCE (not on every connect call).
  // The Room instance is persistent, so listeners must be added exactly once.
  // =========================================================================
  useEffect(() => {
    const onStateChanged = (state: ConnectionState) => {
      console.log('[LiveKit] Connection state changed:', state);
      setRoomState(mapConnectionState(state));
    };

    const onParticipantConnected = (participant: RemoteParticipant) => {
      console.log('[LiveKit] Participant connected:', {
        identity: participant.identity,
        name: participant.name,
      });
      syncParticipants(room);
    };
    const onParticipantDisconnected = (participant: RemoteParticipant) => {
      console.log('[LiveKit] Participant disconnected:', participant.identity);
      syncParticipants(room);
    };
    const onActiveSpeakers = () => syncParticipants(room);
    const onTrackSubscribed = (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      console.log('[LiveKit] Track subscribed:', {
        kind: track.kind,
        source: publication.source,
        participant: participant.identity,
        isMuted: publication.isMuted,
      });
      if (track.kind === Track.Kind.Audio) {
        console.log('[LiveKit] Remote AUDIO track subscribed from', participant.identity, {
          trackSid: publication.trackSid,
          mediaStreamTrackEnabled: track.mediaStreamTrack?.enabled,
          mediaStreamTrackReadyState: track.mediaStreamTrack?.readyState,
          mediaStreamTrackMuted: track.mediaStreamTrack?.muted,
        });
      }
      syncParticipants(room);
    };
    const onTrackUnsubscribed = (
      track: RemoteTrack,
      _publication: RemoteTrackPublication,
      participant: RemoteParticipant
    ) => {
      console.log('[LiveKit] Track unsubscribed:', {
        kind: track.kind,
        participant: participant.identity,
      });
      syncParticipants(room);
    };

    const onDisconnected = () => {
      setRoomState('disconnected');
      setParticipants([]);
      setIsAgentSpeaking(false);
      setIsUserSpeaking(false);
    };

    room.on(RoomEvent.ConnectionStateChanged, onStateChanged);
    room.on(RoomEvent.ParticipantConnected, onParticipantConnected);
    room.on(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
    room.on(RoomEvent.ActiveSpeakersChanged, onActiveSpeakers);
    room.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    room.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
    room.on(RoomEvent.Disconnected, onDisconnected);

    return () => {
      room.off(RoomEvent.ConnectionStateChanged, onStateChanged);
      room.off(RoomEvent.ParticipantConnected, onParticipantConnected);
      room.off(RoomEvent.ParticipantDisconnected, onParticipantDisconnected);
      room.off(RoomEvent.ActiveSpeakersChanged, onActiveSpeakers);
      room.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
      room.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
      room.off(RoomEvent.Disconnected, onDisconnected);
    };
  }, [room, syncParticipants]);

  // =========================================================================
  // Configure AudioSession once on mount (before any connection).
  // Pre-set the iOS audio category to playAndRecord so WebRTC audio can
  // play from the very first packet. Without this, the session starts in
  // soloAmbient mode and early audio packets are silently dropped.
  // =========================================================================
  useEffect(() => {
    const initAudio = async () => {
      try {
        await AudioSession.configureAudio({
          android: {
            preferredOutputList: ['speaker'],
            audioTypeOptions: AndroidAudioTypePresets.communication,
          },
          ios: {
            defaultOutput: 'speaker',
          },
        });
        console.log('[LiveKit] AudioSession.configureAudio() succeeded');
      } catch (e) {
        console.error('[LiveKit] AudioSession.configureAudio() FAILED:', e);
      }
      try {
        await AudioSession.setAppleAudioConfiguration({
          audioCategory: 'playAndRecord',
          audioCategoryOptions: ['allowBluetooth', 'defaultToSpeaker', 'mixWithOthers'],
          audioMode: 'videoChat',
        });
        console.log('[LiveKit] AudioSession.setAppleAudioConfiguration() succeeded');
      } catch (e) {
        console.error('[LiveKit] AudioSession.setAppleAudioConfiguration() FAILED:', e);
      }
    };
    void initAudio();
  }, []);

  const connect = useCallback(
    async (name: string, userId?: string, displayName?: string) => {
      try {
        console.log(
          '[LiveKit] Connecting to room:',
          name,
          'userId:',
          userId,
          'displayName:',
          displayName
        );
        setRoomState('connecting');
        setRoomName(name);

        // Ensure the iOS audio session is in playAndRecord mode with
        // defaultToSpeaker before starting. This prevents early WebRTC audio
        // packets from the agent being dropped due to soloAmbient default.
        await AudioSession.setAppleAudioConfiguration({
          audioCategory: 'playAndRecord',
          audioCategoryOptions: ['allowBluetooth', 'defaultToSpeaker', 'mixWithOthers'],
          audioMode: 'voiceChat',
        });

        // Start the native AudioSession for playback + recording
        await AudioSession.startAudioSession();
        console.log('[LiveKit] Audio session started');

        // Force audio output to speaker (ensures audio isn't routed to
        // a non-existent earpiece, especially important on Simulator)
        await AudioSession.selectAudioOutput('force_speaker');
        console.log('[LiveKit] Audio output forced to speaker');

        // Fetch a real token from the backend API
        const tokenResponse = await getLiveKitToken({
          roomName: name,
          participantName: userId,
          displayName,
        });
        setToken(tokenResponse.token);

        // Connect the existing Room instance (listeners already attached)
        const serverUrl = tokenResponse.serverUrl ?? getLiveKitUrl();
        console.log('[LiveKit] Connecting to server:', serverUrl);
        await room.connect(serverUrl, tokenResponse.token);

        console.log(
          '[LiveKit] Connected to room, remote participants:',
          room.remoteParticipants.size
        );
        setRoomState('connected');
        syncParticipants(room);

        // Enable microphone for voice interaction (may fail on simulator)
        try {
          await room.localParticipant.setMicrophoneEnabled(true);
        } catch (micError) {
          console.warn('Could not enable microphone:', micError);
          setIsMicEnabled(false);
        }
      } catch (error) {
        console.error('Failed to connect to LiveKit:', error);
        setRoomState('error');
        throw error;
      }
    },
    [room, syncParticipants]
  );

  const disconnect = useCallback(async () => {
    // Guard against double-disconnect: if already disconnected, skip.
    // Calling room.disconnect() on an already-closing connection causes
    // an unclean WebSocket close (code 1001, wasClean: false) and can
    // trigger a C++ mutex crash in the native LiveKit SDK.
    if (room.state === ConnectionState.Disconnected) {
      return;
    }

    console.log('[LiveKit] Disconnecting from room');
    await room.disconnect();

    // Stop the native AudioSession when leaving the room
    await AudioSession.stopAudioSession();
    console.log('[LiveKit] Audio session stopped');

    setRoomState('disconnected');
    setRoomName(null);
    setToken(null);
    setParticipants([]);
    setIsAgentSpeaking(false);
    setIsUserSpeaking(false);
  }, [room]);

  const toggleMic = useCallback(() => {
    if (room.state === ConnectionState.Connected) {
      const newEnabled = !isMicEnabled;
      setIsMicEnabled(newEnabled);
      void room.localParticipant.setMicrophoneEnabled(newEnabled);
    }
  }, [room, isMicEnabled]);

  const sendMessage = useCallback(
    (message: string) => {
      if (room.state === ConnectionState.Connected) {
        const encoder = new TextEncoder();
        void room.localParticipant.publishData(encoder.encode(message), { reliable: true });
      }
    },
    [room]
  );

  // Clean up on unmount (safety net — disconnect() guard prevents double-close)
  useEffect(() => {
    return () => {
      if (room.state !== ConnectionState.Disconnected) {
        void room.disconnect();
        void AudioSession.stopAudioSession();
      }
    };
  }, [room]);

  const value = useMemo<LiveKitContextValue>(
    () => ({
      roomState,
      roomName,
      token,
      participants,
      isAgentSpeaking,
      isUserSpeaking,
      isMicEnabled,
      connect,
      disconnect,
      toggleMic,
      sendMessage,
    }),
    [
      roomState,
      roomName,
      token,
      participants,
      isAgentSpeaking,
      isUserSpeaking,
      isMicEnabled,
      connect,
      disconnect,
      toggleMic,
      sendMessage,
    ]
  );

  return <LiveKitContext.Provider value={value}>{children}</LiveKitContext.Provider>;
}

/**
 * Use LiveKit hook
 */
export function useLiveKit(): LiveKitContextValue {
  const context = useContext(LiveKitContext);

  if (!context) {
    throw new Error('useLiveKit must be used within LiveKitProvider');
  }

  return context;
}
