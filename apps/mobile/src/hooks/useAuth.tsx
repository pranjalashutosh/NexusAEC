/**
 * Authentication hook and provider
 *
 * Handles real OAuth 2.0 flows for Google (Gmail) and Microsoft (Outlook)
 * by coordinating with the backend API endpoints.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { Linking } from 'react-native';

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
 * Account token status from backend verification
 */
export type AccountTokenStatus = 'checking' | 'valid' | 'expired';

/**
 * Auth state
 */
export interface AuthState {
  isAuthenticated: boolean;
  hasCompletedOnboarding: boolean;
  accounts: ConnectedAccount[];
  /** Token validity status per account id */
  accountStatuses: Record<string, AccountTokenStatus>;
  preferences: UserPreferences;
  isLoading: boolean;
}

/**
 * Auth context value
 */
interface AuthContextValue extends AuthState {
  connectAccount: (provider: 'google' | 'microsoft') => Promise<void>;
  disconnectAccount: (accountId: string) => Promise<void>;
  reconnectAccount: (account: ConnectedAccount) => Promise<void>;
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

// =============================================================================
// API Helpers
// =============================================================================

function getApiBaseUrl(): string {
  const envApiUrl =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env?.API_BASE_URL;
  return envApiUrl ?? 'http://localhost:3000';
}

interface InitiateAuthResponse {
  authorizationUrl: string;
  state: string;
}

interface AuthSuccessResult {
  success: true;
  provider: string;
  userId: string;
  email?: string;
  displayName?: string;
}

interface AuthPendingResult {
  status: 'pending';
}

type PollResult = AuthSuccessResult | AuthPendingResult | { success: false; error: string };

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Initiate OAuth flow with the backend
 */
async function initiateOAuth(provider: 'google' | 'microsoft'): Promise<InitiateAuthResponse> {
  const apiUrl = getApiBaseUrl();
  const endpoint = provider === 'google' ? '/auth/google' : '/auth/microsoft';

  const response = await fetch(`${apiUrl}${endpoint}`, {
    method: 'GET',
    headers: { 'Accept': 'application/json' },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to initiate OAuth: ${response.status} ${text}`);
  }

  return response.json() as Promise<InitiateAuthResponse>;
}

/**
 * Poll the backend for OAuth completion
 */
async function pollForResult(state: string): Promise<AuthSuccessResult> {
  const apiUrl = getApiBaseUrl();
  const startTime = Date.now();

  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    const response = await fetch(`${apiUrl}/auth/result/${state}`, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
    });

    if (response.status === 202) {
      // Still pending, keep polling
      continue;
    }

    if (response.status === 404) {
      throw new Error('OAuth session expired or not found');
    }

    const data = (await response.json()) as PollResult;

    if ('status' in data && data.status === 'pending') {
      continue;
    }

    if ('success' in data && data.success === true) {
      return data as AuthSuccessResult;
    }

    if ('success' in data && data.success === false) {
      throw new Error(data.error);
    }
  }

  throw new Error('OAuth flow timed out');
}

// =============================================================================
// Provider
// =============================================================================

/**
 * Auth provider component
 */
/**
 * Verify token status with backend for each account
 */
async function verifyTokenStatus(
  accts: ConnectedAccount[],
): Promise<Record<string, AccountTokenStatus>> {
  const statuses: Record<string, AccountTokenStatus> = {};
  const apiUrl = getApiBaseUrl();

  for (const account of accts) {
    const source = account.provider === 'google' ? 'GMAIL' : 'OUTLOOK';
    try {
      const response = await fetch(
        `${apiUrl}/auth/token-status?userId=${encodeURIComponent(account.id)}&source=${source}`,
        { headers: { 'Accept': 'application/json' } },
      );

      if (response.ok) {
        const data = (await response.json()) as {
          success: boolean;
          statuses: Record<string, { hasTokens: boolean }>;
        };
        const key = source.toLowerCase();
        statuses[account.id] = data.statuses[key]?.hasTokens ? 'valid' : 'expired';
      } else {
        statuses[account.id] = 'expired';
      }
    } catch {
      // Network error — assume valid to avoid false negatives when backend is unreachable
      statuses[account.id] = 'valid';
    }
  }

  return statuses;
}

export function AuthProvider({ children }: { children: ReactNode }): React.JSX.Element {
  const [isLoading, setIsLoading] = useState(true);
  const [accounts, setAccounts] = useState<ConnectedAccount[]>([]);
  const [accountStatuses, setAccountStatuses] = useState<Record<string, AccountTokenStatus>>({});
  const [preferences, setPreferences] = useState<UserPreferences>(defaultPreferences);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(false);

  // Load persisted state on mount and verify tokens with backend
  useEffect(() => {
    const loadState = async () => {
      try {
        const [authStateStr, prefsStr, onboardingStr] = await Promise.all([
          AsyncStorage.getItem(STORAGE_KEYS.AUTH_STATE),
          AsyncStorage.getItem(STORAGE_KEYS.PREFERENCES),
          AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING),
        ]);

        let loadedAccounts: ConnectedAccount[] = [];

        if (authStateStr) {
          loadedAccounts = JSON.parse(authStateStr) as ConnectedAccount[];
          setAccounts(loadedAccounts);
        }

        if (prefsStr) {
          const parsedPrefs = JSON.parse(prefsStr) as UserPreferences;
          setPreferences({ ...defaultPreferences, ...parsedPrefs });
        }

        if (onboardingStr === 'true') {
          setHasCompletedOnboarding(true);
        }

        // Verify tokens with backend
        if (loadedAccounts.length > 0) {
          const initialStatuses: Record<string, AccountTokenStatus> = {};
          for (const acct of loadedAccounts) {
            initialStatuses[acct.id] = 'checking';
          }
          setAccountStatuses(initialStatuses);

          const verified = await verifyTokenStatus(loadedAccounts);
          setAccountStatuses(verified);
        }
      } catch (error) {
        console.error('Failed to load auth state:', error);
      } finally {
        setIsLoading(false);
      }
    };

    void loadState();
  }, []);

  const connectAccount = useCallback(async (provider: 'google' | 'microsoft') => {
    // 1. Call backend to initiate OAuth and get the authorization URL
    const { authorizationUrl, state } = await initiateOAuth(provider);

    // 2. Open the authorization URL in the system browser
    const supported = await Linking.canOpenURL(authorizationUrl);
    if (!supported) {
      throw new Error(`Cannot open OAuth URL for ${provider}`);
    }
    await Linking.openURL(authorizationUrl);

    // 3. Poll the backend for the OAuth result
    const result = await pollForResult(state);

    // 4. Create the connected account from the OAuth result
    const newAccount: ConnectedAccount = {
      id: result.userId,
      provider,
      email: result.email ?? (provider === 'google' ? 'connected@gmail.com' : 'connected@outlook.com'),
      name: result.displayName ?? 'Connected User',
      connectedAt: new Date().toISOString(),
    };

    const newAccounts = [...accounts, newAccount];
    setAccounts(newAccounts);
    await AsyncStorage.setItem(STORAGE_KEYS.AUTH_STATE, JSON.stringify(newAccounts));
  }, [accounts]);

  const disconnectAccount = useCallback(async (accountId: string) => {
    const newAccounts = accounts.filter((a) => a.id !== accountId);
    setAccounts(newAccounts);
    setAccountStatuses((prev) => {
      const next = { ...prev };
      delete next[accountId];
      return next;
    });
    await AsyncStorage.setItem(STORAGE_KEYS.AUTH_STATE, JSON.stringify(newAccounts));
  }, [accounts]);

  const reconnectAccount = useCallback(async (account: ConnectedAccount) => {
    // Remove the old account, re-run OAuth, and store the new one
    const filtered = accounts.filter((a) => a.id !== account.id);

    // Initiate OAuth
    const { authorizationUrl, state } = await initiateOAuth(account.provider);

    const supported = await Linking.canOpenURL(authorizationUrl);
    if (!supported) {
      throw new Error(`Cannot open OAuth URL for ${account.provider}`);
    }
    await Linking.openURL(authorizationUrl);

    const result = await pollForResult(state);

    const newAccount: ConnectedAccount = {
      id: result.userId,
      provider: account.provider,
      email: result.email ?? account.email,
      name: result.displayName ?? account.name,
      connectedAt: new Date().toISOString(),
    };

    const newAccounts = [...filtered, newAccount];
    setAccounts(newAccounts);
    setAccountStatuses((prev) => ({ ...prev, [newAccount.id]: 'valid' }));
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
      accountStatuses,
      preferences,
      isLoading,
      connectAccount,
      disconnectAccount,
      reconnectAccount,
      updatePreferences,
      completeOnboarding,
      logout,
    }),
    [
      accounts,
      accountStatuses,
      hasCompletedOnboarding,
      preferences,
      isLoading,
      connectAccount,
      disconnectAccount,
      reconnectAccount,
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
