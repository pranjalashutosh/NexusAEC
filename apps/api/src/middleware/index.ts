/**
 * @nexus-aec/api - Middleware Exports
 */

export {
  createAuthMiddleware,
  registerAuthMiddleware,
  requireAuth,
  optionalAuth,
  generateJWT,
  getAuthenticatedUserId,
  getOptionalUserId,
} from './auth';

export type {
  JWTPayload,
  AuthenticatedUser,
} from './auth';
