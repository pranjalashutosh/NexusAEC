/**
 * Authentication hook and provider
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Connected account information
 */
export interface ConnectedAccount {
  id: string;
  provider: 'google' | 'microsoft';
  email: string;
  name: string;
  connectedAt: string;
}

/**
 * User preferences
 */
export interface UserPreferences {
  vips: string[];
  topics: string[];
  keywords: string[];
  mutedSenders: string[];
  verbosity: 'concise' | 'standard' | 'detailed';
  language: 'en-US' | 'en-GB' | 'en-IN' | 'en-AU';
}

/**
 * Auth state
 */
export interface AuthState {
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;
  accounts: ConnectedAccount[];
  preferences: UserPreferences;
  isLoading: boolean;
}

/**
 * Auth context value
 */
interface AuthContextValue extends AuthState {
  connectAccount: (provider: 'google' | 'microsoft') => Promise<void>;
  disconnectAccount: (accountId: string) => Promise<void>;
  updatePreferences: (prefs: Partial<UserPreferences>) => Promise<void>;
  completeOnboarding: () => Promise<void>;
  logout: () => Promise<void>;
}

const STORAGE_KEYS = {
  AUTH_STATE: '@nexus-aec/auth-state',
  PREFERENCES: '@nexus-aec/preferences',
  ONBOARDING: '@nexus-aec/onboarding-complete',
};

const defaultPreferences: UserPreferences = {
  vips: [],
  topics: [],
  keywords: [],
  mutedSenders: [],
  verbosity: 'standard',
  language: 'en-US',
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

/**
 * Auth provider component
 */
export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [isLoading, setIsLoading] = useState(true);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  // Load persisted state on mount
  useEffect(() => {
    const loadState = async () => {
      try {
        const [authStateStr, prefsStr, onboardingStr] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.AUTH_STATE),
          AsyncStorage.getItem(STORAGE_KEYS.PREFERENCES),
          AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING),
        ]);

        if (authStateStr) {
          const parsedAccounts = JSON.parse(authStateStr) as ConnectedAccount[];
          setAccounts(parsedAccounts);
        }

        if (prefsStr) {
          const parsedPrefs = JSON.parse(prefsStr) as UserPreferences;
          setPreferences({ ...defaultPreferences, ...parsedPrefs });
        }

        if (onboardingStr === 'true') {
          setHasCompletedOnboarding(true);
        }
      } catch (error) {
        console.error('Failed to load auth state:', error);
      } finally {
        setIsLoading(false);
      }
    };

    loadState();
  }, []);

  const connectAccount = useCallback(async (provider: 'google' | 'microsoft') => {
    // In a real app, this would trigger OAuth flow
    // For now, we simulate a successful connection
    const mockAccount: ConnectedAccount = {
      id: `${provider}-${Date.now()}`,
      provider,
      email: provider === 'google' ? 'user@gmail.com' : 'user@outlook.com',
      name: 'User Name',
      connectedAt: new Date().toISOString(),
    };

    const newAccounts = [...accounts, mockAccount];
    setAccounts(newAccounts);
    await AsyncStorage.setItem(STORAGE_KEYS.AUTH_STATE, JSON.stringify(newAccounts));
  }, [accounts]);

  const disconnectAccount = useCallback(async (accountId: string) => {
    const newAccounts = accounts.filter((a) => a.id !== accountId);
    setAccounts(newAccounts);
    await AsyncStorage.setItem(STORAGE_KEYS.AUTH_STATE, JSON.stringify(newAccounts));
  }, [accounts]);

  const updatePreferences = useCallback(async (prefs: Partial<UserPreferences>) => {
    const newPrefs = { ...preferences, ...prefs };
    setPreferences(newPrefs);
    await AsyncStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(newPrefs));
  }, [preferences]);

  const completeOnboarding = useCallback(async () => {
    setHasCompletedOnboarding(true);
    await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING, 'true');
  }, []);

  const logout = useCallback(async () => {
    setAccounts([]);
    setPreferences(defaultPreferences);
    setHasCompletedOnboarding(false);
    await Promise.all([
      AsyncStorage.removeItem(STORAGE_KEYS.AUTH_STATE),
      AsyncStorage.removeItem(STORAGE_KEYS.PREFERENCES),
      AsyncStorage.removeItem(STORAGE_KEYS.ONBOARDING),
    ]);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      isAuthenticated: accounts.length > 0,
      hasCompletedOnboarding,
      accounts,
      preferences,
      isLoading,
      connectAccount,
      disconnectAccount,
      updatePreferences,
      completeOnboarding,
      logout,
    }),
    [
      accounts,
      hasCompletedOnboarding,
      preferences,
      isLoading,
      connectAccount,
      disconnectAccount,
      updatePreferences,
      completeOnboarding,
      logout,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Use auth hook
 */
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }

  return context;
}
