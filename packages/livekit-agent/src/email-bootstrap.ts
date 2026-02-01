/**
 * @nexus-aec/livekit-agent - Email Service Bootstrap
 *
 * Wires the email-provider layer into the voice agent by:
 * 1. Extracting OAuth credentials from LiveKit participant/room metadata
 * 2. Instantiating OutlookAdapter / GmailAdapter
 * 3. Creating UnifiedInboxService and SmartDraftService
 * 4. Registering them via setEmailServices() so tool executors can use them
 */

import { createLogger } from '@nexus-aec/logger';
import {
  OutlookAdapter,
  GmailAdapter,
  UnifiedInboxService,
  SmartDraftService,
} from '@nexus-aec/email-providers';

import type {
  EmailProvider,
  EmailProviderConfig,
  OAuthTokens,
  EmailSource,
} from '@nexus-aec/email-providers';

import { setEmailServices, clearEmailServices } from './tools/email-tools.js';

const logger = createLogger({ baseContext: { component: 'email-bootstrap' } });

// =============================================================================
// Types
// =============================================================================

/**
 * Email credentials passed via participant or room metadata.
 *
 * The backend API is responsible for securely placing these tokens
 * into the participant's metadata when generating a LiveKit join token.
 */
export interface EmailCredentials {
  /** User ID for multi-account support */
  userId: string;
  /** Outlook OAuth tokens (optional — user may only have Gmail) */
  outlook?: OAuthTokens;
  /** Gmail OAuth tokens (optional — user may only have Outlook) */
  gmail?: OAuthTokens;
}

/**
 * Result of bootstrapping email services
 */
export interface EmailBootstrapResult {
  /** Whether at least one provider was connected */
  success: boolean;
  /** Which providers were connected */
  connectedProviders: EmailSource[];
  /** The unified inbox service (null if no providers) */
  inboxService: UnifiedInboxService | null;
  /** The smart draft service (null if no providers) */
  draftService: SmartDraftService | null;
  /** Errors encountered during setup */
  errors: Array<{ source: EmailSource; error: string }>;
}

// =============================================================================
// Metadata Parsing
// =============================================================================

/**
 * Parse email credentials from LiveKit participant or room metadata.
 *
 * The metadata is expected to be a JSON string containing an `email` field
 * with the structure defined by EmailCredentials.
 *
 * @example Participant metadata JSON:
 * ```json
 * {
 *   "email": {
 *     "userId": "user-123",
 *     "outlook": { "accessToken": "...", "refreshToken": "...", ... },
 *     "gmail": { "accessToken": "...", "refreshToken": "...", ... }
 *   }
 * }
 * ```
 */
export function parseEmailCredentials(metadata: string | undefined): EmailCredentials | null {
  if (!metadata) {
    logger.debug('No metadata provided');
    return null;
  }

  try {
    const parsed = JSON.parse(metadata) as Record<string, unknown>;
    const emailData = parsed['email'] as Record<string, unknown> | undefined;

    if (!emailData) {
      logger.debug('No email credentials in metadata');
      return null;
    }

    const userId = emailData['userId'] as string | undefined;
    if (!userId) {
      logger.warn('Email credentials missing userId');
      return null;
    }

    const credentials: EmailCredentials = { userId };

    // Parse Outlook tokens
    const outlookTokens = emailData['outlook'] as OAuthTokens | undefined;
    if (outlookTokens?.accessToken) {
      credentials.outlook = outlookTokens;
    }

    // Parse Gmail tokens
    const gmailTokens = emailData['gmail'] as OAuthTokens | undefined;
    if (gmailTokens?.accessToken) {
      credentials.gmail = gmailTokens;
    }

    if (!credentials.outlook && !credentials.gmail) {
      logger.warn('Email credentials present but no provider tokens found');
      return null;
    }

    logger.info('Parsed email credentials', {
      userId,
      hasOutlook: !!credentials.outlook,
      hasGmail: !!credentials.gmail,
    });

    return credentials;
  } catch (error) {
    logger.error('Failed to parse email credentials from metadata', error instanceof Error ? error : null);
    return null;
  }
}

// =============================================================================
// Bootstrap
// =============================================================================

/**
 * Create email provider adapters from credentials.
 */
function createProviders(credentials: EmailCredentials): {
  providers: EmailProvider[];
  errors: Array<{ source: EmailSource; error: string }>;
} {
  const providers: EmailProvider[] = [];
  const errors: Array<{ source: EmailSource; error: string }> = [];

  if (credentials.outlook) {
    try {
      const config: EmailProviderConfig = {
        userId: credentials.userId,
        tokens: credentials.outlook,
      };
      providers.push(new OutlookAdapter(config));
      logger.info('Outlook adapter created', { userId: credentials.userId });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create Outlook adapter', error instanceof Error ? error : null);
      errors.push({ source: 'OUTLOOK', error: msg });
    }
  }

  if (credentials.gmail) {
    try {
      const config: EmailProviderConfig = {
        userId: credentials.userId,
        tokens: credentials.gmail,
      };
      providers.push(new GmailAdapter(config));
      logger.info('Gmail adapter created', { userId: credentials.userId });
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      logger.error('Failed to create Gmail adapter', error instanceof Error ? error : null);
      errors.push({ source: 'GMAIL', error: msg });
    }
  }

  return { providers, errors };
}

/**
 * Bootstrap email services for the current voice session.
 *
 * This is the main entry point called by agent.ts after a user joins.
 * It creates the provider adapters, wraps them in unified services,
 * and registers them so tool executors can operate on real email.
 *
 * @param credentials - OAuth tokens parsed from participant metadata
 * @returns Bootstrap result with connected providers and any errors
 */
export function bootstrapEmailServices(credentials: EmailCredentials): EmailBootstrapResult {
  const { providers, errors } = createProviders(credentials);

  if (providers.length === 0) {
    logger.warn('No email providers could be created', { errors });
    return {
      success: false,
      connectedProviders: [],
      inboxService: null,
      draftService: null,
      errors,
    };
  }

  // Create unified inbox
  const inboxService = new UnifiedInboxService(providers, {
    continueOnError: true,
    defaultPageSize: 25,
    requestTimeoutMs: 15000,
  });

  // Create smart draft service
  const providerMap: Partial<Record<EmailSource, EmailProvider>> = {};
  for (const provider of providers) {
    providerMap[provider.source] = provider;
  }

  const defaultSource: EmailSource = providerMap['OUTLOOK'] ? 'OUTLOOK' : 'GMAIL';
  const fallbackSource: EmailSource = defaultSource === 'OUTLOOK' ? 'GMAIL' : 'OUTLOOK';

  const draftService = new SmartDraftService(providerMap, {
    defaultSource,
    fallbackSource,
    defaultPendingReview: true,
  });

  // Register with the tool executors
  setEmailServices(inboxService, draftService);

  const connectedProviders = providers.map((p) => p.source);

  logger.info('Email services bootstrapped', {
    connectedProviders,
    defaultDraftSource: defaultSource,
  });

  return {
    success: true,
    connectedProviders,
    inboxService,
    draftService,
    errors,
  };
}

/**
 * Attempt to bootstrap email services from LiveKit participant metadata.
 *
 * This is a convenience wrapper that combines parsing and bootstrapping.
 * If no credentials are found, it logs a warning but does not throw —
 * the agent will still work, just without email capabilities.
 *
 * @param metadata - Raw metadata string from participant or room
 * @returns Bootstrap result, or null if no credentials found
 */
export function bootstrapFromMetadata(metadata: string | undefined): EmailBootstrapResult | null {
  const credentials = parseEmailCredentials(metadata);

  if (!credentials) {
    logger.info('No email credentials in metadata — email tools will be unavailable');
    return null;
  }

  return bootstrapEmailServices(credentials);
}

/**
 * Tear down email services (call on session end).
 * Delegates to clearEmailServices().
 */
export function teardownEmailServices(): void {
  clearEmailServices();
  logger.info('Email services torn down');
}
