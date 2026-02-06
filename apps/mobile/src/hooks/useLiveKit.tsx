/**
 * LiveKit hook and provider
 *
 * Manages a real LiveKit Room connection for voice briefings.
 * Uses livekit-client Room class with the token service for authentication.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import {
  Room,
  RoomEvent,
  ConnectionState,
  DataPacket_Kind,
  type RemoteParticipant,
} from 'livekit-client';
import {
  AudioSession,
  AndroidAudioTypePresets,
  useIOSAudioManagement,
} from '@livekit/react-native';

import { getLiveKitToken } from '../services/livekit-token';

/**
 * LiveKit room state
 */
export type RoomState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'error';

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
  connect: (roomName: string, userId?: string) => Promise<void>;
  /** Disconnect from room */
  disconnect: () => Promise<void>;
  /** Toggle microphone */
  toggleMic: () => void;
  /** Send data message to agent */
  sendMessage: (message: string) => void;
}

const LiveKitContext = createContext<LiveKitContextValue | undefined>(undefined);

function getServerUrl(): string {
  const envUrl =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env?.LIVEKIT_URL;
  return envUrl ?? 'wss://localhost:7880';
}

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
  const roomRef = useRef<Room | null>(room);

  // Automatically configure iOS AVAudioSession as audio tracks change
  // (e.g. switches to playAndRecord when remote audio arrives)
  useIOSAudioManagement(room, true);

  /**
   * Build participant list from the Room object
   */
  const syncParticipants = useCallback((room: Room) => {
    const parts: Participant[] = [];

    // Local participant
    const local = room.localParticipant;
    parts.push({
      identity: local.identity,
      name: local.name,
      isLocal: true,
      isSpeaking: local.isSpeaking,
    });
    setIsUserSpeaking(local.isSpeaking);

    // Remote participants
    room.remoteParticipants.forEach((remote) => {
      parts.push({
        identity: remote.identity,
        name: remote.name,
        isLocal: false,
        isSpeaking: remote.isSpeaking,
      });
    });

    setParticipants(parts);

    // Check if agent is speaking (agent identity typically starts with "agent")
    const agent = Array.from(room.remoteParticipants.values()).find(
      (p) => p.identity.startsWith('agent') || p.kind === 1, // ParticipantKind.AGENT = 1
    );
    setIsAgentSpeaking(agent?.isSpeaking ?? false);
  }, []);

  /**
   * Set up event listeners on the Room
   */
  const attachRoomListeners = useCallback((room: Room) => {
    room.on(RoomEvent.ConnectionStateChanged, (state: ConnectionState) => {
      setRoomState(mapConnectionState(state));
    });

    room.on(RoomEvent.ParticipantConnected, () => {
      syncParticipants(room);
    });

    room.on(RoomEvent.ParticipantDisconnected, () => {
      syncParticipants(room);
    });

    room.on(RoomEvent.ActiveSpeakersChanged, () => {
      syncParticipants(room);
    });

    room.on(RoomEvent.Disconnected, () => {
      setRoomState('disconnected');
      setParticipants([]);
      setIsAgentSpeaking(false);
      setIsUserSpeaking(false);
    });
  }, [syncParticipants]);

  const connect = useCallback(async (name: string, userId?: string) => {
    try {
      setRoomState('connecting');
      setRoomName(name);

      // Configure and start the native AudioSession for playback + recording
      await AudioSession.configureAudio({
        android: {
          preferredOutputList: ['speaker'],
          audioTypeOptions: AndroidAudioTypePresets.communication,
        },
        ios: {
          defaultOutput: 'speaker',
        },
      });
      await AudioSession.startAudioSession();

      // Fetch a real token from the backend API
      const tokenResponse = await getLiveKitToken({
        roomName: name,
        participantName: userId,
      });
      setToken(tokenResponse.token);

      // Attach listeners and connect the existing Room instance
      attachRoomListeners(room);

      const serverUrl = tokenResponse.serverUrl ?? getServerUrl();
      await room.connect(serverUrl, tokenResponse.token);

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
  }, [room, attachRoomListeners, syncParticipants]);

  const disconnect = useCallback(async () => {
    if (room) {
      await room.disconnect();
    }

    // Stop the native AudioSession when leaving the room
    await AudioSession.stopAudioSession();

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

  const sendMessage = useCallback((message: string) => {
    if (room.state === ConnectionState.Connected) {
      const encoder = new TextEncoder();
      void room.localParticipant.publishData(
        encoder.encode(message),
        { reliable: true },
      );
    }
  }, [room]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      void room.disconnect();
      void AudioSession.stopAudioSession();
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
