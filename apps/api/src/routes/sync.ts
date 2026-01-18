/**
 * @nexus-aec/api - Sync Routes
 *
 * Handles synchronization of drafts and preferences between mobile and desktop clients.
 */

import type { FastifyInstance } from 'fastify';
import { createLogger } from '@nexus-aec/logger';

const logger = createLogger({ baseContext: { component: 'sync-routes' } });

// =============================================================================
// Types
// =============================================================================

/**
 * Draft reference (synced between clients)
 */
interface DraftReference {
  id: string;
  source: 'google' | 'microsoft';
  accountId: string;
  recipientEmail: string;
  recipientName?: string;
  subject: string;
  bodyPreview: string;
  threadId?: string;
  redFlagScore?: number;
  redFlagReasons?: string[];
  createdAt: string;
  updatedAt: string;
  status: 'pending' | 'approved' | 'sent' | 'deleted';
}

/**
 * User preferences
 */
interface UserPreferences {
  vips: string[];
  keywords: string[];
  topics: string[];
  mutedSenders: string[];
  verbosity: 'concise' | 'standard' | 'detailed';
  language: string;
  theme: string;
  auditRetentionDays: number;
  lastSyncedAt?: string;
}

/**
 * Sync response
 */
interface SyncResponse<T> {
  success: true;
  data: T;
  syncedAt: string;
}

/**
 * Sync error response
 */
interface SyncErrorResponse {
  success: false;
  error: string;
  code: string;
}

// =============================================================================
// In-Memory Storage (Replace with database in production)
// =============================================================================

// User drafts storage: Map<userId, DraftReference[]>
const userDrafts = new Map<string, DraftReference[]>();

// User preferences storage: Map<userId, UserPreferences>
const userPreferences = new Map<string, UserPreferences>();

// Default preferences
const DEFAULT_PREFERENCES: UserPreferences = {
  vips: [],
  keywords: ['urgent', 'ASAP', 'deadline'],
  topics: [],
  mutedSenders: [],
  verbosity: 'standard',
  language: 'en-US',
  theme: 'system',
  auditRetentionDays: 30,
};

// =============================================================================
// Drafts Routes
// =============================================================================

/**
 * Register sync routes
 */
export function registerSyncRoutes(app: FastifyInstance): void {
  // ---------------------------------------------------------------------------
  // Drafts Sync Endpoints
  // ---------------------------------------------------------------------------

  /**
   * Get all drafts for a user
   * GET /sync/drafts
   */
  app.get<{ Querystring: { userId?: string; status?: string } }>(
    '/sync/drafts',
    async (request, reply) => {
      // In production, userId would come from authenticated session
      const userId = request.query.userId ?? 'default-user';
      const statusFilter = request.query.status;

      let drafts = userDrafts.get(userId) ?? [];

      // Apply status filter if provided
      if (statusFilter) {
        drafts = drafts.filter((d) => d.status === statusFilter);
      }

      // Sort by updatedAt descending
      drafts.sort(
        (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );

      logger.info('Drafts fetched', { userId, count: drafts.length });

      return reply.send({
        success: true,
        data: drafts,
        syncedAt: new Date().toISOString(),
      } satisfies SyncResponse<DraftReference[]>);
    }
  );

  /**
   * Get a single draft by ID
   * GET /sync/drafts/:draftId
   */
  app.get<{ Params: { draftId: string }; Querystring: { userId?: string } }>(
    '/sync/drafts/:draftId',
    async (request, reply) => {
      const userId = request.query.userId ?? 'default-user';
      const { draftId } = request.params;

      const drafts = userDrafts.get(userId) ?? [];
      const draft = drafts.find((d) => d.id === draftId);

      if (!draft) {
        return reply.status(404).send({
          success: false,
          error: 'Draft not found',
          code: 'DRAFT_NOT_FOUND',
        } satisfies SyncErrorResponse);
      }

      return reply.send({
        success: true,
        data: draft,
        syncedAt: new Date().toISOString(),
      } satisfies SyncResponse<DraftReference>);
    }
  );

  /**
   * Create or update drafts (batch sync)
   * PUT /sync/drafts
   */
  app.put<{
    Body: { userId?: string; drafts: DraftReference[] };
  }>('/sync/drafts', async (request, reply) => {
    const userId = request.body.userId ?? 'default-user';
    const incomingDrafts = request.body.drafts;

    if (!Array.isArray(incomingDrafts)) {
      return reply.status(400).send({
        success: false,
        error: 'drafts must be an array',
        code: 'INVALID_DRAFTS',
      } satisfies SyncErrorResponse);
    }

    const currentDrafts = userDrafts.get(userId) ?? [];
    const syncedAt = new Date().toISOString();

    // Merge incoming drafts with existing (last-write-wins)
    for (const incoming of incomingDrafts) {
      const existingIndex = currentDrafts.findIndex((d) => d.id === incoming.id);

      if (existingIndex >= 0) {
        const existing = currentDrafts[existingIndex];
        if (existing) {
          // Only update if incoming is newer
          if (new Date(incoming.updatedAt) > new Date(existing.updatedAt)) {
            currentDrafts[existingIndex] = { ...incoming };
          }
        }
      } else {
        // New draft
        currentDrafts.push({ ...incoming });
      }
    }

    userDrafts.set(userId, currentDrafts);

    logger.info('Drafts synced', {
      userId,
      incoming: incomingDrafts.length,
      total: currentDrafts.length,
    });

    return reply.send({
      success: true,
      data: currentDrafts,
      syncedAt,
    } satisfies SyncResponse<DraftReference[]>);
  });

  /**
   * Create a new draft
   * POST /sync/drafts
   */
  app.post<{ Body: { userId?: string; draft: Omit<DraftReference, 'id' | 'createdAt' | 'updatedAt'> } }>(
    '/sync/drafts',
    async (request, reply) => {
      const userId = request.body.userId ?? 'default-user';
      const draftData = request.body.draft;

      if (!draftData) {
        return reply.status(400).send({
          success: false,
          error: 'draft is required',
          code: 'MISSING_DRAFT',
        } satisfies SyncErrorResponse);
      }

      const now = new Date().toISOString();
      const newDraft: DraftReference = {
        ...draftData,
        id: `draft-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
        createdAt: now,
        updatedAt: now,
      };

      const currentDrafts = userDrafts.get(userId) ?? [];
      currentDrafts.push(newDraft);
      userDrafts.set(userId, currentDrafts);

      logger.info('Draft created', { userId, draftId: newDraft.id });

      return reply.status(201).send({
        success: true,
        data: newDraft,
        syncedAt: now,
      } satisfies SyncResponse<DraftReference>);
    }
  );

  /**
   * Update a draft
   * PATCH /sync/drafts/:draftId
   */
  app.patch<{
    Params: { draftId: string };
    Body: { userId?: string; updates: Partial<DraftReference> };
  }>('/sync/drafts/:draftId', async (request, reply) => {
    const userId = request.body.userId ?? 'default-user';
    const { draftId } = request.params;
    const updates = request.body.updates;

    const currentDrafts = userDrafts.get(userId) ?? [];
    const draftIndex = currentDrafts.findIndex((d) => d.id === draftId);

    const existingDraft = currentDrafts[draftIndex];
    if (draftIndex < 0 || !existingDraft) {
      return reply.status(404).send({
        success: false,
        error: 'Draft not found',
        code: 'DRAFT_NOT_FOUND',
      } satisfies SyncErrorResponse);
    }

    const now = new Date().toISOString();
    const updatedDraft: DraftReference = {
      ...existingDraft,
      ...updates,
      updatedAt: now,
    };
    currentDrafts[draftIndex] = updatedDraft;

    userDrafts.set(userId, currentDrafts);

    logger.info('Draft updated', { userId, draftId });

    return reply.send({
      success: true,
      data: updatedDraft,
      syncedAt: now,
    } satisfies SyncResponse<DraftReference>);
  });

  /**
   * Delete a draft
   * DELETE /sync/drafts/:draftId
   */
  app.delete<{ Params: { draftId: string }; Querystring: { userId?: string } }>(
    '/sync/drafts/:draftId',
    async (request, reply) => {
      const userId = request.query.userId ?? 'default-user';
      const { draftId } = request.params;

      const currentDrafts = userDrafts.get(userId) ?? [];
      const draftIndex = currentDrafts.findIndex((d) => d.id === draftId);
      const draftToDelete = currentDrafts[draftIndex];

      if (draftIndex < 0 || !draftToDelete) {
        return reply.status(404).send({
          success: false,
          error: 'Draft not found',
          code: 'DRAFT_NOT_FOUND',
        } satisfies SyncErrorResponse);
      }

      // Soft delete - mark as deleted
      draftToDelete.status = 'deleted';
      draftToDelete.updatedAt = new Date().toISOString();

      userDrafts.set(userId, currentDrafts);

      logger.info('Draft deleted', { userId, draftId });

      return reply.send({
        success: true,
        data: { deleted: true, id: draftId },
        syncedAt: new Date().toISOString(),
      } satisfies SyncResponse<{ deleted: boolean; id: string }>);
    }
  );

  // ---------------------------------------------------------------------------
  // Preferences Sync Endpoints
  // ---------------------------------------------------------------------------

  /**
   * Get user preferences
   * GET /sync/preferences
   */
  app.get<{ Querystring: { userId?: string } }>(
    '/sync/preferences',
    async (request, reply) => {
      const userId = request.query.userId ?? 'default-user';

      const prefs = userPreferences.get(userId) ?? { ...DEFAULT_PREFERENCES };

      logger.info('Preferences fetched', { userId });

      return reply.send({
        success: true,
        data: prefs,
        syncedAt: new Date().toISOString(),
      } satisfies SyncResponse<UserPreferences>);
    }
  );

  /**
   * Update user preferences
   * PUT /sync/preferences
   */
  app.put<{ Body: { userId?: string } & Partial<UserPreferences> }>(
    '/sync/preferences',
    async (request, reply) => {
      const { userId: bodyUserId, ...updates } = request.body;
      const userId = bodyUserId ?? 'default-user';

      const currentPrefs = userPreferences.get(userId) ?? { ...DEFAULT_PREFERENCES };
      const syncedAt = new Date().toISOString();

      // Check for conflict using lastSyncedAt
      if (
        updates.lastSyncedAt &&
        currentPrefs.lastSyncedAt &&
        new Date(updates.lastSyncedAt) < new Date(currentPrefs.lastSyncedAt)
      ) {
        // Client has older data, return current server state
        logger.warn('Preferences sync conflict, client behind', {
          userId,
          clientSync: updates.lastSyncedAt,
          serverSync: currentPrefs.lastSyncedAt,
        });
      }

      // Merge updates (last-write-wins)
      const mergedPrefs: UserPreferences = {
        ...currentPrefs,
        ...updates,
        lastSyncedAt: syncedAt,
      };

      userPreferences.set(userId, mergedPrefs);

      logger.info('Preferences updated', { userId });

      return reply.send({
        success: true,
        data: mergedPrefs,
        syncedAt,
      } satisfies SyncResponse<UserPreferences>);
    }
  );

  /**
   * Patch specific preference fields
   * PATCH /sync/preferences
   */
  app.patch<{ Body: { userId?: string } & Partial<UserPreferences> }>(
    '/sync/preferences',
    async (request, reply) => {
      const { userId: bodyUserId, ...updates } = request.body;
      const userId = bodyUserId ?? 'default-user';

      const currentPrefs = userPreferences.get(userId) ?? { ...DEFAULT_PREFERENCES };
      const syncedAt = new Date().toISOString();

      // Partial merge
      const mergedPrefs: UserPreferences = {
        ...currentPrefs,
        ...updates,
        lastSyncedAt: syncedAt,
      };

      userPreferences.set(userId, mergedPrefs);

      logger.info('Preferences patched', { userId, fields: Object.keys(updates) });

      return reply.send({
        success: true,
        data: mergedPrefs,
        syncedAt,
      } satisfies SyncResponse<UserPreferences>);
    }
  );

  /**
   * Reset preferences to defaults
   * DELETE /sync/preferences
   */
  app.delete<{ Querystring: { userId?: string } }>(
    '/sync/preferences',
    async (request, reply) => {
      const userId = request.query.userId ?? 'default-user';

      const resetPrefs: UserPreferences = {
        ...DEFAULT_PREFERENCES,
        lastSyncedAt: new Date().toISOString(),
      };

      userPreferences.set(userId, resetPrefs);

      logger.info('Preferences reset', { userId });

      return reply.send({
        success: true,
        data: resetPrefs,
        syncedAt: new Date().toISOString(),
      } satisfies SyncResponse<UserPreferences>);
    }
  );
}
