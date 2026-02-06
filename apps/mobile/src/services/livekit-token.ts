/**
 * LiveKit Token Service
 *
 * Fetches room access tokens from the backend API
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Token request parameters
 */
export interface TokenRequest {
  roomName: string;
  participantName?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Token response from backend
 */
export interface TokenResponse {
  token: string;
  roomName: string;
  participantIdentity: string;
  expiresAt: number;
  serverUrl?: string;
}

/**
 * Token cache entry
 */
interface CachedToken {
  token: string;
  roomName: string;
  expiresAt: number;
}

const TOKEN_CACHE_KEY = '@nexus-aec/livekit-token-cache';
const TOKEN_EXPIRY_BUFFER_MS = 60 * 1000; // 1 minute buffer before expiry

/**
 * Get API base URL from environment
 */
function getApiBaseUrl(): string {
  // In production, this would come from environment config
  // For development, use local API or staging
  const envApiUrl =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env?.API_BASE_URL;
  return envApiUrl ?? 'http://localhost:3000';
}

/**
 * Fetch a new token from the backend
 */
async function fetchToken(request: TokenRequest): Promise<TokenResponse> {
  const apiUrl = getApiBaseUrl();
  const endpoint = `${apiUrl}/livekit/token`;

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      // In production, include auth token
      // 'Authorization': `Bearer ${authToken}`,
    },
    body: JSON.stringify({
      userId: request.participantName ?? 'user',
      roomName: request.roomName,
      metadata: request.metadata,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Failed to fetch LiveKit token: ${response.status} ${errorText}`);
  }

  const data = (await response.json()) as TokenResponse;
  return data;
}

/**
 * Get cached token if valid
 */
async function getCachedToken(roomName: string): Promise<CachedToken | null> {
  try {
    const cacheStr = await AsyncStorage.getItem(TOKEN_CACHE_KEY);
    if (!cacheStr) {
      return null;
    }

    const cache = JSON.parse(cacheStr) as Record<string, CachedToken>;
    const cached = cache[roomName];

    if (!cached) {
      return null;
    }

    // Check if token is still valid (with buffer)
    const now = Date.now();
    if (cached.expiresAt - TOKEN_EXPIRY_BUFFER_MS <= now) {
      // Token expired or about to expire
      return null;
    }

    return cached;
  } catch {
    return null;
  }
}

/**
 * Cache a token
 */
async function cacheToken(roomName: string, token: string, expiresAt: number): Promise<void> {
  try {
    const cacheStr = await AsyncStorage.getItem(TOKEN_CACHE_KEY);
    const cache: Record<string, CachedToken> = cacheStr ? JSON.parse(cacheStr) : {};

    cache[roomName] = {
      token,
      roomName,
      expiresAt,
    };

    await AsyncStorage.setItem(TOKEN_CACHE_KEY, JSON.stringify(cache));
  } catch (error) {
    console.error('Failed to cache token:', error);
  }
}

/**
 * Clear token cache
 */
export async function clearTokenCache(): Promise<void> {
  await AsyncStorage.removeItem(TOKEN_CACHE_KEY);
}

/**
 * Get a LiveKit room access token
 *
 * Uses cached token if valid, otherwise fetches a new one
 */
export async function getLiveKitToken(request: TokenRequest): Promise<TokenResponse> {
  // Check cache first
  const cached = await getCachedToken(request.roomName);
  if (cached) {
    return {
      token: cached.token,
      roomName: cached.roomName,
      participantIdentity: 'user',
      expiresAt: cached.expiresAt,
    };
  }

  // Fetch new token
  const response = await fetchToken(request);

  // Cache for future use
  await cacheToken(request.roomName, response.token, response.expiresAt);

  return response;
}

/**
 * Generate a unique room name for a new briefing session
 */
export function generateRoomName(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `briefing-${timestamp}-${random}`;
}

/**
 * Create a briefing room and get access token
 */
export async function createBriefingRoom(
  participantName?: string,
  metadata?: Record<string, unknown>
): Promise<TokenResponse> {
  const roomName = generateRoomName();

  return getLiveKitToken({
    roomName,
    participantName,
    metadata: {
      ...metadata,
      type: 'briefing',
      createdAt: new Date().toISOString(),
    },
  });
}
