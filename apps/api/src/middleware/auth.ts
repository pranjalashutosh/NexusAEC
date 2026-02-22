/**
 * @nexus-aec/api - JWT Authentication Middleware
 *
 * Provides JWT-based authentication for protected API routes.
 */

import { createLogger } from '@nexus-aec/logger';

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';

const logger = createLogger({ baseContext: { component: 'auth-middleware' } });

// =============================================================================
// Types
// =============================================================================

/**
 * JWT payload structure
 */
export interface JWTPayload {
  /** Subject - typically user ID */
  sub: string;
  /** Issued at timestamp */
  iat: number;
  /** Expiration timestamp */
  exp: number;
  /** User email */
  email?: string;
  /** User display name */
  name?: string;
  /** Additional claims */
  [key: string]: unknown;
}

/**
 * Authenticated user attached to request
 */
export interface AuthenticatedUser {
  id: string;
  email?: string;
  name?: string;
}

/**
 * Extend FastifyRequest to include authenticated user
 */
declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
  }
}

/**
 * Auth error response
 */
interface AuthErrorResponse {
  success: false;
  error: string;
  code: string;
}

// =============================================================================
// Configuration
// =============================================================================

/**
 * Get JWT configuration from environment
 */
function getJWTConfig(): {
  secret: string;
  issuer: string;
  audience: string;
} {
  return {
    secret: process.env['JWT_SECRET'] ?? 'development-secret-change-in-production',
    issuer: process.env['JWT_ISSUER'] ?? 'nexus-aec-api',
    audience: process.env['JWT_AUDIENCE'] ?? 'nexus-aec-client',
  };
}

// =============================================================================
// JWT Utilities
// =============================================================================

/**
 * Base64url decode
 */
function base64UrlDecode(str: string): string {
  // Add padding
  const pad = str.length % 4;
  const padded = pad ? str + '='.repeat(4 - pad) : str;
  // Convert base64url to base64
  const base64 = padded.replace(/-/g, '+').replace(/_/g, '/');
  return Buffer.from(base64, 'base64').toString('utf-8');
}

/**
 * Base64url encode
 */
function base64UrlEncode(str: string): string {
  const base64 = Buffer.from(str).toString('base64');
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * HMAC-SHA256 sign
 */
async function hmacSign(payload: string, secret: string): Promise<string> {
  const crypto = await import('crypto');
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('base64');
  return signature.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Verify JWT token
 */
async function verifyJWT(token: string, secret: string): Promise<JWTPayload | null> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) {
      return null;
    }

    const [headerB64, payloadB64, signatureB64] = parts;

    const headerB64Str = headerB64 as string;
    const payloadB64Str = payloadB64 as string;
    const signatureB64Str = signatureB64 as string;

    // Verify signature
    const signatureInput = `${headerB64Str}.${payloadB64Str}`;
    const expectedSignature = await hmacSign(signatureInput, secret);

    if (signatureB64Str !== expectedSignature) {
      logger.debug('JWT signature mismatch');
      return null;
    }

    // Decode payload
    const payloadJson = base64UrlDecode(payloadB64Str);
    const payload = JSON.parse(payloadJson) as JWTPayload;

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp && payload.exp < now) {
      logger.debug('JWT expired', { exp: payload.exp, now });
      return null;
    }

    // Check not before
    const nbfValue = payload['nbf'];
    if (nbfValue && typeof nbfValue === 'number' && nbfValue > now) {
      logger.debug('JWT not yet valid', { nbf: nbfValue, now });
      return null;
    }

    return payload;
  } catch (error) {
    logger.debug('JWT verification failed', {
      errorMessage: error instanceof Error ? error.message : 'Unknown error',
    });
    return null;
  }
}

/**
 * Generate a JWT token
 */
export async function generateJWT(
  userId: string,
  options?: {
    email?: string;
    name?: string;
    expiresInSeconds?: number;
  }
): Promise<string> {
  const config = getJWTConfig();
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = options?.expiresInSeconds ?? 86400; // Default 24 hours

  const header = {
    alg: 'HS256',
    typ: 'JWT',
  };

  const payload: JWTPayload = {
    sub: userId,
    iat: now,
    exp: now + expiresIn,
    iss: config.issuer,
    aud: config.audience,
  };

  // Only add optional fields if they have values
  if (options?.email) {
    payload.email = options.email;
  }
  if (options?.name) {
    payload.name = options.name;
  }

  const headerB64 = base64UrlEncode(JSON.stringify(header));
  const payloadB64 = base64UrlEncode(JSON.stringify(payload));
  const signature = await hmacSign(`${headerB64}.${payloadB64}`, config.secret);

  return `${headerB64}.${payloadB64}.${signature}`;
}

// =============================================================================
// Middleware
// =============================================================================

/**
 * Authentication middleware options
 */
interface AuthMiddlewareOptions {
  /** Skip authentication for these paths */
  excludePaths?: string[];
  /** Require authentication (default: true) */
  required?: boolean;
}

/**
 * Create authentication middleware
 */
export function createAuthMiddleware(options: AuthMiddlewareOptions = {}) {
  const { excludePaths = [], required = true } = options;
  const config = getJWTConfig();

  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    // Check if path should be excluded
    const path = request.url.split('?')[0] ?? '/';
    if (excludePaths.some((p) => path.startsWith(p))) {
      return;
    }

    // Get token from Authorization header
    const authHeader = request.headers.authorization;
    if (!authHeader) {
      if (required) {
        return reply.status(401).send({
          success: false,
          error: 'Authorization header required',
          code: 'MISSING_AUTH_HEADER',
        } satisfies AuthErrorResponse);
      }
      return;
    }

    // Validate Bearer token format
    if (!authHeader.startsWith('Bearer ')) {
      if (required) {
        return reply.status(401).send({
          success: false,
          error: 'Invalid authorization format. Use: Bearer <token>',
          code: 'INVALID_AUTH_FORMAT',
        } satisfies AuthErrorResponse);
      }
      return;
    }

    const token = authHeader.substring(7);

    // Verify token
    const payload = await verifyJWT(token, config.secret);
    if (!payload) {
      if (required) {
        return reply.status(401).send({
          success: false,
          error: 'Invalid or expired token',
          code: 'INVALID_TOKEN',
        } satisfies AuthErrorResponse);
      }
      return;
    }

    // Attach user to request
    const user: AuthenticatedUser = {
      id: payload.sub,
    };
    if (typeof payload.email === 'string') {
      user.email = payload.email;
    }
    if (typeof payload.name === 'string') {
      user.name = payload.name;
    }
    request.user = user;

    logger.debug('Request authenticated', {
      userId: payload.sub,
      path,
    });
  };
}

/**
 * Register authentication hooks on the Fastify instance
 */
export function registerAuthMiddleware(
  app: FastifyInstance,
  options: AuthMiddlewareOptions = {}
): void {
  const authMiddleware = createAuthMiddleware(options);

  app.addHook('preHandler', authMiddleware);

  logger.info('Auth middleware registered', {
    excludePaths: options.excludePaths,
    required: options.required ?? true,
  });
}

// =============================================================================
// Route Decorators (for selective auth)
// =============================================================================

/**
 * Require authentication for a specific route
 */
export function requireAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  return createAuthMiddleware({ required: true })(request, reply);
}

/**
 * Optional authentication - attach user if token present
 */
export function optionalAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  return createAuthMiddleware({ required: false })(request, reply);
}

// =============================================================================
// User ID Extraction Utilities
// =============================================================================

/**
 * Get authenticated user ID from request
 * Throws if user is not authenticated
 */
export function getAuthenticatedUserId(request: FastifyRequest): string {
  if (!request.user) {
    throw new Error('User not authenticated');
  }
  return request.user.id;
}

/**
 * Get authenticated user ID or null
 */
export function getOptionalUserId(request: FastifyRequest): string | null {
  return request.user?.id ?? null;
}
