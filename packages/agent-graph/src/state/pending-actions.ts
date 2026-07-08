/**
 * `pending_actions` channel helpers + the `upsertById` reducer.
 *
 * A pending action is a tool call the ReAct worker has staged but not yet
 * committed — it waits behind an `interrupt()` approval gate (Graph B, §6).
 * The approval auto-rejects after 60 seconds (D4); the worker sweeper is the
 * authoritative timer because the voice session may be gone (D2).
 */

import { randomUUID } from 'crypto';

import type { PendingAction } from '@nexus-aec/shared-types';

/** Approval time-to-live in milliseconds (D4). */
export const APPROVAL_TTL_MS = 60_000;

/**
 * Reducer for the `pending_actions` channel. Upserts by `id` so a status
 * transition (`proposed` → `approved`/`rejected`/`executed`/`failed`) replaces
 * the prior record in place while leaving untouched actions alone.
 */
export function upsertById(existing: PendingAction[], update: PendingAction[]): PendingAction[] {
  const byId = new Map<string, PendingAction>();
  for (const action of existing) {
    byId.set(action.id, action);
  }
  for (const incoming of update) {
    const prev = byId.get(incoming.id);
    byId.set(incoming.id, prev ? { ...prev, ...incoming } : incoming);
  }
  return [...byId.values()];
}

/** Fields required to stage an action; the rest are derived. */
export interface NewPendingAction {
  tool: string;
  args: Record<string, unknown>;
  riskLevel: PendingAction['riskLevel'];
}

/**
 * Build a freshly-proposed pending action with a 60s expiry (D4). `now` is
 * injectable for deterministic tests.
 */
export function createPendingAction(
  input: NewPendingAction,
  now: Date = new Date()
): PendingAction {
  return {
    id: randomUUID(),
    tool: input.tool,
    args: input.args,
    riskLevel: input.riskLevel,
    status: 'proposed',
    expiresAt: new Date(now.getTime() + APPROVAL_TTL_MS).toISOString(),
  };
}

/**
 * True when a still-proposed action has passed its expiry. Actions that have
 * already resolved (approved/rejected/executed/failed) are never "expired".
 */
export function isExpired(action: PendingAction, now: Date = new Date()): boolean {
  if (action.status !== 'proposed') {
    return false;
  }
  return now.getTime() >= new Date(action.expiresAt).getTime();
}

/** Return the still-proposed actions that have expired as of `now`. */
export function expiredActions(actions: PendingAction[], now: Date = new Date()): PendingAction[] {
  return actions.filter((action) => isExpired(action, now));
}
