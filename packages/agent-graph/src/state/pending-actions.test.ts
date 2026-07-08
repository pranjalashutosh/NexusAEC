import type { PendingAction } from '@nexus-aec/shared-types';

import {
  APPROVAL_TTL_MS,
  createPendingAction,
  expiredActions,
  isExpired,
  upsertById,
} from './pending-actions';

function action(overrides: Partial<PendingAction> & { id: string }): PendingAction {
  return {
    tool: 'archive_email',
    args: { emailId: 'e1' },
    riskLevel: 'low',
    status: 'proposed',
    expiresAt: '2026-07-02T10:01:00.000Z',
    ...overrides,
  };
}

describe('upsertById', () => {
  it('appends a new action', () => {
    const result = upsertById([], [action({ id: 'a' })]);

    expect(result.map((a) => a.id)).toEqual(['a']);
  });

  it('merges an update onto an existing action by id', () => {
    const existing = [action({ id: 'a', status: 'proposed' })];

    const result = upsertById(existing, [action({ id: 'a', status: 'approved' })]);

    expect(result).toHaveLength(1);
    expect(result[0]?.status).toBe('approved');
  });

  it('leaves unrelated actions untouched', () => {
    const existing = [action({ id: 'a' }), action({ id: 'b' })];

    const result = upsertById(existing, [action({ id: 'a', status: 'executed' })]);

    expect(result.find((a) => a.id === 'b')?.status).toBe('proposed');
  });
});

describe('createPendingAction', () => {
  it('stamps a proposed action expiring 60s from now', () => {
    const now = new Date('2026-07-02T10:00:00.000Z');

    const created = createPendingAction(
      { tool: 'create_draft', args: { to: 'x@y.com' }, riskLevel: 'medium' },
      now
    );

    expect(created.status).toBe('proposed');
    expect(created.tool).toBe('create_draft');
    expect(created.riskLevel).toBe('medium');
    expect(created.id).toMatch(/[0-9a-f-]{36}/);
    expect(new Date(created.expiresAt).getTime() - now.getTime()).toBe(APPROVAL_TTL_MS);
  });

  it('generates a distinct id per call', () => {
    const a = createPendingAction({ tool: 't', args: {}, riskLevel: 'low' });
    const b = createPendingAction({ tool: 't', args: {}, riskLevel: 'low' });

    expect(a.id).not.toBe(b.id);
  });
});

describe('isExpired', () => {
  const now = new Date('2026-07-02T10:01:30.000Z');

  it('is true for a proposed action past its expiry', () => {
    expect(isExpired(action({ id: 'a', expiresAt: '2026-07-02T10:01:00.000Z' }), now)).toBe(true);
  });

  it('is false before expiry', () => {
    expect(isExpired(action({ id: 'a', expiresAt: '2026-07-02T10:02:00.000Z' }), now)).toBe(false);
  });

  it('is false for an already-resolved action even if past expiry', () => {
    expect(
      isExpired(action({ id: 'a', status: 'approved', expiresAt: '2026-07-02T10:00:00.000Z' }), now)
    ).toBe(false);
  });
});

describe('expiredActions', () => {
  it('returns only the proposed, past-expiry actions', () => {
    const now = new Date('2026-07-02T10:01:30.000Z');
    const actions = [
      action({ id: 'expired', expiresAt: '2026-07-02T10:01:00.000Z' }),
      action({ id: 'fresh', expiresAt: '2026-07-02T10:05:00.000Z' }),
      action({ id: 'resolved', status: 'rejected', expiresAt: '2026-07-02T10:00:00.000Z' }),
    ];

    const result = expiredActions(actions, now);

    expect(result.map((a) => a.id)).toEqual(['expired']);
  });
});
