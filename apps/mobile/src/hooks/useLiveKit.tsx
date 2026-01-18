/**
 * LiveKit hook and provider
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useMemo,
  type ReactNode,
} from 'react';

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
  connect: (roomName: string) => Promise<void>;
  /** Disconnect from room */
  disconnect: () => Promise<void>;
  /** Toggle microphone */
  toggleMic: () => void;
  /** Send data message to agent */
  sendMessage: (message: string) => void;
}

const LiveKitContext = createContext<LiveKitContextValue | undefined>(undefined);

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

  const connect = useCallback(async (name: string) => {
    try {
      setRoomState('connecting');
      setRoomName(name);

      // In a real app, fetch token from backend
      // const tokenResponse = await fetch(`${API_URL}/livekit/token?room=${name}`);
      // const { token } = await tokenResponse.json();
      const mockToken = 'mock-token-for-development';
      setToken(mockToken);

      // Simulate connection delay
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // In a real app, connect using @livekit/react-native
      // const room = new Room();
      // await room.connect(LIVEKIT_URL, token);

      setRoomState('connected');

      // Add mock agent participant
      setParticipants([
        {
          identity: 'agent',
          name: 'Nexus',
          isLocal: false,
          isSpeaking: false,
        },
        {
          identity: 'user',
          name: 'You',
          isLocal: true,
          isSpeaking: false,
        },
      ]);
    } catch (error) {
      console.error('Failed to connect to LiveKit:', error);
      setRoomState('error');
      throw error;
    }
  }, []);

  const disconnect = useCallback(async () => {
    // In a real app, disconnect from room
    // await room.disconnect();

    setRoomState('disconnected');
    setRoomName(null);
    setToken(null);
    setParticipants([]);
    setIsAgentSpeaking(false);
    setIsUserSpeaking(false);
  }, []);

  const toggleMic = useCallback(() => {
    setIsMicEnabled((prev) => !prev);
    // In a real app, toggle local audio track
    // localParticipant.setMicrophoneEnabled(!isMicEnabled);
  }, []);

  const sendMessage = useCallback((message: string) => {
    // In a real app, send data message through LiveKit
    // room.localParticipant.publishData(encoder.encode(message), DataPacket_Kind.RELIABLE);
    console.log('Sending message to agent:', message);

    // Simulate agent response
    setIsAgentSpeaking(true);
    setTimeout(() => {
      setIsAgentSpeaking(false);
    }, 2000);
  }, []);

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
