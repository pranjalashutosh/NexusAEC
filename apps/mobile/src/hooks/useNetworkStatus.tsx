/**
 * Network status hook and provider
 */

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { AppState, type AppStateStatus } from 'react-native';

/**
 * Network status
 */
export type NetworkStatus = 'online' | 'offline' | 'unknown';

/**
 * Connection quality
 */
export type ConnectionQuality = 'excellent' | 'good' | 'poor' | 'lost';

/**
 * Network context value
 */
interface NetworkContextValue {
  status: NetworkStatus;
  quality: ConnectionQuality;
  isOnline: boolean;
  isOffline: boolean;
  lastOnlineAt: Date | null;
}

const NetworkContext = createContext<NetworkContextValue | undefined>(undefined);

/**
 * Network provider component
 */
export function NetworkProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [status, setStatus] = useState<NetworkStatus>('unknown');
  const [quality, setQuality] = useState<ConnectionQuality>('good');
  const [lastOnlineAt, setLastOnlineAt] = useState<Date | null>(null);

  // Monitor app state changes
  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (nextAppState === 'active') {
        // App came to foreground, assume online until proven otherwise
        setStatus('online');
        setLastOnlineAt(new Date());
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    // Initial state
    setStatus('online');
    setLastOnlineAt(new Date());

    return () => {
      subscription.remove();
    };
  }, []);

  // In a real app, we would use @react-native-community/netinfo
  // For now, we simulate network status
  useEffect(() => {
    // Simulate network quality changes (for demo purposes)
    const interval = setInterval(() => {
      // Randomly update quality to simulate real conditions
      const qualities: ConnectionQuality[] = ['excellent', 'good', 'poor'];
      const randomQuality = qualities[Math.floor(Math.random() * qualities.length)];
      if (randomQuality) {
        setQuality(randomQuality);
      }
    }, 30000); // Every 30 seconds

    return () => clearInterval(interval);
  }, []);

  const value = useMemo<NetworkContextValue>(
    () => ({
      status,
      quality,
      isOnline: status === 'online',
      isOffline: status === 'offline',
      lastOnlineAt,
    }),
    [status, quality, lastOnlineAt]
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

/**
 * Use network status hook
 */
export function useNetworkStatus(): NetworkContextValue {
  const context = useContext(NetworkContext);

  if (!context) {
    throw new Error('useNetworkStatus must be used within NetworkProvider');
  }

  return context;
}
