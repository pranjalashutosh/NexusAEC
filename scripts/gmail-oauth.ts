#!/usr/bin/env npx ts-node
/**
 * Gmail OAuth Flow Helper
 *
 * This script helps you complete the Gmail OAuth flow to obtain access tokens
 * for testing the NexusAEC integration with real Gmail data.
 *
 * Usage:
 *   npx ts-node scripts/gmail-oauth.ts
 *
 * Prerequisites:
 *   1. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in your .env file
 *   2. Add http://localhost:3333/callback as an authorized redirect URI
 *      in your Google Cloud Console OAuth 2.0 credentials
 *
 * After completion, copy the tokens to your .env file.
 */

import http from 'http';
import { URL } from 'url';

import dotenv from 'dotenv';

import { GoogleOAuthProvider } from '../packages/email-providers/src/oauth/google';

// Load environment variables
dotenv.config();

// Configuration
const PORT = 3333;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;

// ANSI colors for terminal output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

function log(message: string, color: keyof typeof colors = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function main() {
  log('\n🔐 Gmail OAuth Flow Helper\n', 'bright');

  // Validate environment
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    log('❌ Missing required environment variables:', 'red');
    if (!clientId) {log('   - GOOGLE_CLIENT_ID', 'red');}
    if (!clientSecret) {log('   - GOOGLE_CLIENT_SECRET', 'red');}
    log('\nPlease add these to your .env file and try again.', 'yellow');
    process.exit(1);
  }

  log('✅ Environment variables loaded', 'green');
  log(`   Client ID: ${clientId.substring(0, 20)}...`, 'cyan');

  // Initialize OAuth provider
  const oauthProvider = new GoogleOAuthProvider({
    clientId,
    clientSecret,
    redirectUri: REDIRECT_URI,
  });

  // Generate authorization URL
  log('\n📝 Generating authorization URL...', 'cyan');
  const { url: authUrl, state: oauthState } = await oauthProvider.getAuthorizationUrl({
    prompt: 'consent', // Force consent to get refresh token
    accessType: 'offline',
  });

  log('✅ Authorization URL generated\n', 'green');

  // Start local server to handle callback
  const tokens = await new Promise<{
    accessToken: string;
    refreshToken: string;
    expiresAt: string;
    scopes: string[];
  }>((resolve, reject) => {
    const server = http.createServer(async (req, res) => {
      const reqUrl = new URL(req.url || '/', `http://localhost:${PORT}`);

      if (reqUrl.pathname === '/callback') {
        const code = reqUrl.searchParams.get('code');
        const returnedState = reqUrl.searchParams.get('state');
        const error = reqUrl.searchParams.get('error');

        if (error) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #dc2626;">❌ OAuth Error</h1>
                <p>Error: ${error}</p>
                <p>Description: ${reqUrl.searchParams.get('error_description') || 'Unknown'}</p>
                <p style="color: #666;">You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error(`OAuth error: ${error}`));
          return;
        }

        if (!code) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #dc2626;">❌ Missing Authorization Code</h1>
                <p style="color: #666;">You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error('Missing authorization code'));
          return;
        }

        // Verify state
        if (returnedState !== oauthState.state) {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #dc2626;">❌ State Mismatch</h1>
                <p>Security validation failed.</p>
                <p style="color: #666;">You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(new Error('State mismatch - potential CSRF attack'));
          return;
        }

        try {
          // Exchange code for tokens
          log('\n🔄 Exchanging authorization code for tokens...', 'cyan');
          const tokenResult = await oauthProvider.exchangeCodeForTokens(code, oauthState);

          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #16a34a;">✅ OAuth Complete!</h1>
                <p>Tokens have been received successfully.</p>
                <p style="color: #666;">You can close this window and return to the terminal.</p>
              </body>
            </html>
          `);

          server.close();
          resolve({
            accessToken: tokenResult.accessToken,
            refreshToken: tokenResult.refreshToken,
            expiresAt: tokenResult.expiresAt,
            scopes: tokenResult.scopes,
          });
        } catch (err) {
          res.writeHead(500, { 'Content-Type': 'text/html' });
          res.end(`
            <html>
              <body style="font-family: system-ui; padding: 40px; text-align: center;">
                <h1 style="color: #dc2626;">❌ Token Exchange Failed</h1>
                <p>${err instanceof Error ? err.message : 'Unknown error'}</p>
                <p style="color: #666;">You can close this window.</p>
              </body>
            </html>
          `);
          server.close();
          reject(err);
        }
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    server.listen(PORT, () => {
      log(`🌐 Local server started on http://localhost:${PORT}`, 'green');
      log('\n' + '='.repeat(70), 'yellow');
      log('📋 IMPORTANT: Make sure you have added this redirect URI to Google Cloud Console:', 'yellow');
      log(`   ${REDIRECT_URI}`, 'bright');
      log('='.repeat(70) + '\n', 'yellow');

      log('🔗 Opening authorization URL in your browser...\n', 'cyan');
      log('If the browser doesn\'t open automatically, copy and paste this URL:\n', 'yellow');
      console.log(authUrl);
      console.log('');

      // Try to open the browser
      const openCommand =
        process.platform === 'darwin'
          ? 'open'
          : process.platform === 'win32'
            ? 'start'
            : 'xdg-open';

      void import('child_process').then(({ exec }) => {
        exec(`${openCommand} "${authUrl}"`, (err) => {
          if (err) {
            log('⚠️  Could not open browser automatically. Please copy the URL above.', 'yellow');
          }
        });
      });

      log('⏳ Waiting for OAuth callback...', 'cyan');
    });

    server.on('error', (err) => {
      reject(err);
    });
  });

  // Display results
  log('\n' + '='.repeat(70), 'green');
  log('🎉 OAuth Flow Complete!', 'bright');
  log('='.repeat(70) + '\n', 'green');

  log('📝 Add these to your .env file:\n', 'cyan');
  console.log('# Gmail OAuth Tokens (obtained ' + new Date().toISOString() + ')');
  console.log(`GOOGLE_ACCESS_TOKEN=${tokens.accessToken}`);
  console.log(`GOOGLE_REFRESH_TOKEN=${tokens.refreshToken}`);
  console.log('');

  log('ℹ️  Token Details:', 'cyan');
  console.log(`   Expires at: ${tokens.expiresAt}`);
  console.log(`   Scopes: ${tokens.scopes.length} granted`);

  // Validate the token
  log('\n🔍 Validating token...', 'cyan');
  const validation = await oauthProvider.validateToken(tokens.accessToken);
  if (validation.valid && validation.userInfo) {
    log('✅ Token is valid!', 'green');
    console.log(`   Email: ${validation.userInfo.email}`);
    console.log(`   Name: ${validation.userInfo.name || 'N/A'}`);
  } else {
    log('⚠️  Token validation failed: ' + (validation.error || 'Unknown'), 'yellow');
  }

  log('\n📋 Next Steps:', 'cyan');
  console.log('   1. Copy the GOOGLE_ACCESS_TOKEN and GOOGLE_REFRESH_TOKEN to your .env file');
  console.log('   2. Run: npx ts-node test-integration.ts');
  console.log('   3. The Gmail tests should now work with your real email data\n');
}

// Run the script
main().catch((error) => {
  log(`\n❌ Error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
