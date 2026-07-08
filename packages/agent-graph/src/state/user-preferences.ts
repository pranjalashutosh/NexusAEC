/**
 * Per-run hydration of the `user_preferences` state channel.
 *
 * Durable preference data is never persisted *via* graph checkpoints (§8) — it
 * is read from its existing homes at run start and folded into a single
 * `HydratedPreferences` snapshot that the sorting/worker nodes read.
 *
 * Sources are injected structurally (not by concrete class) so agent-graph
 * stays free of a `livekit-agent` dependency: the worker passes the real
 * `PreferencesStore` / `UserKnowledgeStore` / `SenderProfileStore` instances,
 * which satisfy these interfaces by shape. Every source is best-effort — a
 * store being down degrades the snapshot, it never fails the run.
 */

import { logger } from '@nexus-aec/logger';

const log = logger.child({ module: 'agent-graph:user-preferences' });

/** The hydrated snapshot read by classify/apply-rules/plan nodes. */
export interface HydratedPreferences {
  userId: string;
  /** VIP identifiers (email or `@domain`), lowercased. */
  vips: string[];
  /** Muted-sender identifiers (email or `@domain`), lowercased. */
  mutedSenders: string[];
  topics: Array<{ topic: string; priority: number; muted: boolean }>;
  keywords: Array<{ pattern: string; weight: number }>;
  /** User knowledge entry contents (rules + preferences + context). */
  knowledge: string[];
  /** `SenderProfileStore.synthesizePreferences()` block — may be empty. */
  senderInsights: string;
}

/** Structural view of `PreferencesStore`. */
export interface PreferencesSource {
  getPreferences(): Promise<{
    vips: Array<{ identifier: string }>;
    keywords: Array<{ pattern: string; weight: number }>;
    topics: Array<{ topic: string; priority: number; muted: boolean }>;
    mutedSenders: Array<{ identifier: string }>;
  }>;
}

/** Structural view of `UserKnowledgeStore`. */
export interface KnowledgeSource {
  /** Must be awaited before reads (lazyConnect Redis) — optional for stubs. */
  waitForReady?(): Promise<void>;
  get(userId: string): Promise<{ entries: Array<{ content: string }> }>;
}

/** Structural view of `SenderProfileStore.synthesizePreferences`. */
export interface SenderInsightSource {
  synthesizePreferences(userId: string, senderEmails: string[]): Promise<string>;
}

export interface HydrationSources {
  preferences?: PreferencesSource;
  knowledge?: KnowledgeSource;
  senderInsights?: SenderInsightSource;
}

export interface HydrationOptions {
  /** Senders in this run's inbox; scopes the sender-insight synthesis. */
  senderEmails?: string[];
}

/** Empty snapshot for `default: () =>` and the failure floor. */
export function emptyPreferences(userId: string): HydratedPreferences {
  return {
    userId,
    vips: [],
    mutedSenders: [],
    topics: [],
    keywords: [],
    knowledge: [],
    senderInsights: '',
  };
}

function toError(err: unknown): Error {
  return err instanceof Error ? err : new Error(String(err));
}

/**
 * Read the three preference sources and assemble a `HydratedPreferences`.
 * Each source is guarded independently — a failure logs and leaves that slice
 * empty.
 */
export async function hydratePreferences(
  userId: string,
  sources: HydrationSources,
  options: HydrationOptions = {}
): Promise<HydratedPreferences> {
  const result = emptyPreferences(userId);

  if (sources.preferences) {
    try {
      const prefs = await sources.preferences.getPreferences();
      result.vips = prefs.vips.map((v) => v.identifier.toLowerCase());
      result.mutedSenders = prefs.mutedSenders.map((m) => m.identifier.toLowerCase());
      result.topics = prefs.topics.map((t) => ({
        topic: t.topic,
        priority: t.priority,
        muted: t.muted,
      }));
      result.keywords = prefs.keywords.map((k) => ({ pattern: k.pattern, weight: k.weight }));
    } catch (err) {
      log.warn('Failed to hydrate preferences store; continuing without it', {
        userId,
        error: toError(err).message,
      });
    }
  }

  if (sources.knowledge) {
    try {
      await sources.knowledge.waitForReady?.();
      const doc = await sources.knowledge.get(userId);
      result.knowledge = doc.entries.map((e) => e.content);
    } catch (err) {
      log.warn('Failed to hydrate user knowledge; continuing without it', {
        userId,
        error: toError(err).message,
      });
    }
  }

  const senderEmails = options.senderEmails ?? [];
  if (sources.senderInsights && senderEmails.length > 0) {
    try {
      result.senderInsights = await sources.senderInsights.synthesizePreferences(
        userId,
        senderEmails
      );
    } catch (err) {
      log.warn('Failed to synthesize sender insights; continuing without them', {
        userId,
        error: toError(err).message,
      });
    }
  }

  return result;
}
