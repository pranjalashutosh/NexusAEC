import type { InboxQueueItem, QueuePriority } from '@nexus-aec/shared-types';

import { applyStatusDeltas, mergeByEmailId, priorityRank, sortByPriority } from './inbox-queue';

function item(overrides: Partial<InboxQueueItem> & { emailId: string }): InboxQueueItem {
  return {
    from: 'sender@example.com',
    subject: 'Subject',
    receivedAt: '2026-07-02T10:00:00.000Z',
    priority: 'medium',
    summary: 'a short summary',
    status: 'pending',
    ...overrides,
  };
}

describe('priorityRank', () => {
  it('orders high before medium before low', () => {
    expect(priorityRank('high')).toBeLessThan(priorityRank('medium'));
    expect(priorityRank('medium')).toBeLessThan(priorityRank('low'));
  });
});

describe('sortByPriority', () => {
  it('sorts by priority bucket, then most-recent-first, then emailId', () => {
    // Arrange
    const items = [
      item({ emailId: 'c', priority: 'low', receivedAt: '2026-07-02T12:00:00.000Z' }),
      item({ emailId: 'a', priority: 'high', receivedAt: '2026-07-02T09:00:00.000Z' }),
      item({ emailId: 'b', priority: 'high', receivedAt: '2026-07-02T11:00:00.000Z' }),
    ];

    // Act
    const sorted = sortByPriority(items).map((i) => i.emailId);

    // Assert — high(b newest, a older) then low(c)
    expect(sorted).toEqual(['b', 'a', 'c']);
  });

  it('does not mutate the input array', () => {
    const items = [
      item({ emailId: 'x', priority: 'low' }),
      item({ emailId: 'y', priority: 'high' }),
    ];
    const before = items.map((i) => i.emailId);

    sortByPriority(items);

    expect(items.map((i) => i.emailId)).toEqual(before);
  });
});

describe('mergeByEmailId', () => {
  it('appends brand-new items and returns them priority-ordered', () => {
    const existing = [item({ emailId: 'a', priority: 'low' })];
    const update = [item({ emailId: 'b', priority: 'high' })];

    const merged = mergeByEmailId(existing, update);

    expect(merged.map((i) => i.emailId)).toEqual(['b', 'a']);
  });

  it('upserts an existing item by emailId, taking incoming content', () => {
    const existing = [item({ emailId: 'a', summary: 'old', priority: 'low' })];
    const update = [item({ emailId: 'a', summary: 'new', priority: 'high' })];

    const merged = mergeByEmailId(existing, update);

    expect(merged).toHaveLength(1);
    expect(merged[0]?.summary).toBe('new');
    expect(merged[0]?.priority).toBe('high');
  });

  it('never regresses status when a background re-sort re-emits pending (idempotent re-run)', () => {
    const existing = [item({ emailId: 'a', status: 'actioned' })];
    const reSort = [item({ emailId: 'a', status: 'pending' })];

    const merged = mergeByEmailId(existing, reSort);

    expect(merged[0]?.status).toBe('actioned');
  });

  it('advances status when the update carries a more-progressed status', () => {
    const existing = [item({ emailId: 'a', status: 'pending' })];
    const update = [item({ emailId: 'a', status: 'actioned' })];

    const merged = mergeByEmailId(existing, update);

    expect(merged[0]?.status).toBe('actioned');
  });

  it('promotes pending to briefed', () => {
    const merged = mergeByEmailId(
      [item({ emailId: 'a', status: 'pending' })],
      [item({ emailId: 'a', status: 'briefed' })]
    );

    expect(merged[0]?.status).toBe('briefed');
  });
});

describe('applyStatusDeltas', () => {
  const queue: InboxQueueItem[] = [
    item({ emailId: 'a', status: 'pending' }),
    item({ emailId: 'b', status: 'pending' }),
  ];

  it('applies a status change to the matching email', () => {
    const next = applyStatusDeltas(queue, [{ emailId: 'a', status: 'actioned' }]);

    expect(next.find((i) => i.emailId === 'a')?.status).toBe('actioned');
    expect(next.find((i) => i.emailId === 'b')?.status).toBe('pending');
  });

  it('ignores deltas for unknown emailIds', () => {
    const next = applyStatusDeltas(queue, [{ emailId: 'zzz', status: 'skipped' }]);

    expect(next.map((i) => i.status)).toEqual(['pending', 'pending']);
  });

  it('returns the same reference when there are no deltas', () => {
    const next = applyStatusDeltas(queue, []);

    expect(next).toBe(queue);
  });
});

// Type-only guard: ensure QueuePriority stays a 3-member union the ranks cover.
const _priorityCoverage: Record<QueuePriority, number> = {
  high: priorityRank('high'),
  medium: priorityRank('medium'),
  low: priorityRank('low'),
};
void _priorityCoverage;
