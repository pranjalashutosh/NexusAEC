/**
 * API Configuration
 *
 * Centralized API URL configuration for the mobile app.
 * In development, points to the local backend API server.
 * In production, this would point to the deployed API.
 */

import { Platform } from 'react-native';

// =============================================================================
// Configuration
// =============================================================================

/**
 * For physical device testing, set this to your ngrok URL.
 * Run: ngrok http 3000
 * Then paste the https URL here (e.g., 'https://abc123.ngrok-free.app')
 * Set to null to use default localhost/IP-based URL.
 */
const NGROK_URL: string | null = 'https://forty-blocks-impaired-phd.trycloudflare.com';

/**
 * Get the API base URL.
 *
 * For physical device testing, we need the Mac's local network IP
 * since localhost/127.0.0.1 only resolves to the phone itself.
 *
 * For Android emulator, 10.0.2.2 maps to the host machine's localhost.
 * For iOS simulator, localhost works directly.
 * For physical devices, use ngrok tunnel or Mac's WiFi IP address.
 */
export function getApiBaseUrl(): string {
  // Check for runtime override (e.g., from react-native-config in the future)
  const envApiUrl =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env?.API_BASE_URL;
  if (envApiUrl) return envApiUrl;

  // Use ngrok tunnel if configured (for physical device testing)
  if (NGROK_URL) return NGROK_URL;

  // Development defaults
  if (__DEV__) {
    if (Platform.OS === 'android') {
      // Android emulator maps 10.0.2.2 to host localhost
      return 'http://10.0.2.2:3000';
    }
    // iOS simulator — localhost works directly
    return 'http://localhost:3000';
  }

  // Production URL (update when deploying)
  return 'https://api.nexusaec.com';
}

/**
 * Get the LiveKit server URL.
 */
export function getLiveKitUrl(): string {
  const envUrl =
    (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
      ?.env?.LIVEKIT_URL;
  return envUrl ?? 'wss://nexusaec-xabnsrmi.livekit.cloud';
}
