/**
 * OAuth Handler for Desktop
 */

import { shell } from 'electron';

const API_BASE_URL = process.env.API_BASE_URL ?? 'http://localhost:3000';

/**
 * OAuth configuration
 */
interface OAuthConfig {
  clientId: string;
  authUrl: string;
  redirectUri: string;
  scope: string;
}

const GOOGLE_CONFIG: OAuthConfig = {
  clientId: process.env.GOOGLE_CLIENT_ID ?? '',
  authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
  redirectUri: 'nexusaec://auth/google/callback',
  scope: 'openid email profile https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.send https://www.googleapis.com/auth/calendar.readonly',
};

const MICROSOFT_CONFIG: OAuthConfig = {
  clientId: process.env.MICROSOFT_CLIENT_ID ?? '',
  authUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
  redirectUri: 'nexusaec://auth/microsoft/callback',
  scope: 'openid email profile offline_access User.Read Mail.ReadWrite Mail.Send Calendars.Read',
};

/**
 * Initiate OAuth flow
 */
export async function initiateOAuth(provider: 'google' | 'microsoft'): Promise<void> {
  const config = provider === 'google' ? GOOGLE_CONFIG : MICROSOFT_CONFIG;

  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: 'code',
    scope: config.scope,
    access_type: 'offline',
    prompt: 'consent',
  });

  const authUrl = `${config.authUrl}?${params.toString()}`;

  // Open in default browser
  await shell.openExternal(authUrl);
}

/**
 * Handle OAuth callback
 */
export async function handleOAuthCallback(
  provider: string,
  code: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const response = await fetch(`${API_BASE_URL}/auth/${provider}/callback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });

    if (!response.ok) {
      const error = await response.text();
      return { success: false, error };
    }

    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
