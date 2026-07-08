import {
  emptyPreferences,
  hydratePreferences,
  type KnowledgeSource,
  type PreferencesSource,
  type SenderInsightSource,
} from './user-preferences';

function preferencesStub(): PreferencesSource {
  return {
    getPreferences: jest.fn().mockResolvedValue({
      vips: [{ identifier: 'CEO@Company.com' }],
      keywords: [{ pattern: 'urgent', weight: 0.9 }],
      topics: [{ topic: 'Budget', priority: 0.8, muted: false }],
      mutedSenders: [{ identifier: '@Newsletter.io' }],
    }),
  };
}

function knowledgeStub(): KnowledgeSource {
  return {
    waitForReady: jest.fn().mockResolvedValue(undefined),
    get: jest.fn().mockResolvedValue({
      entries: [{ content: 'Always CC my assistant' }, { content: '[rule] never show promos' }],
    }),
  };
}

describe('emptyPreferences', () => {
  it('produces an all-empty snapshot carrying the userId', () => {
    expect(emptyPreferences('u1')).toEqual({
      userId: 'u1',
      vips: [],
      mutedSenders: [],
      topics: [],
      keywords: [],
      knowledge: [],
      senderInsights: '',
    });
  });
});

describe('hydratePreferences', () => {
  it('assembles all three sources and normalizes identifiers to lowercase', async () => {
    const senderInsights: SenderInsightSource = {
      synthesizePreferences: jest.fn().mockResolvedValue('USER LEARNED PREFERENCES: ...'),
    };

    const result = await hydratePreferences(
      'u1',
      { preferences: preferencesStub(), knowledge: knowledgeStub(), senderInsights },
      { senderEmails: ['a@b.com'] }
    );

    expect(result.vips).toEqual(['ceo@company.com']);
    expect(result.mutedSenders).toEqual(['@newsletter.io']);
    expect(result.topics).toEqual([{ topic: 'Budget', priority: 0.8, muted: false }]);
    expect(result.keywords).toEqual([{ pattern: 'urgent', weight: 0.9 }]);
    expect(result.knowledge).toEqual(['Always CC my assistant', '[rule] never show promos']);
    expect(result.senderInsights).toBe('USER LEARNED PREFERENCES: ...');
    expect(senderInsights.synthesizePreferences).toHaveBeenCalledWith('u1', ['a@b.com']);
  });

  it('waits for the knowledge store to be ready before reading', async () => {
    const knowledge = knowledgeStub();

    await hydratePreferences('u1', { knowledge });

    expect(knowledge.waitForReady).toHaveBeenCalledTimes(1);
    expect(knowledge.get).toHaveBeenCalledWith('u1');
  });

  it('returns empty slices when no sources are provided', async () => {
    const result = await hydratePreferences('u1', {});

    expect(result).toEqual(emptyPreferences('u1'));
  });

  it('does not call sender synthesis when there are no sender emails', async () => {
    const senderInsights: SenderInsightSource = {
      synthesizePreferences: jest.fn().mockResolvedValue('should not run'),
    };

    const result = await hydratePreferences('u1', { senderInsights }, { senderEmails: [] });

    expect(senderInsights.synthesizePreferences).not.toHaveBeenCalled();
    expect(result.senderInsights).toBe('');
  });

  it('degrades gracefully: a failing source is skipped, others still hydrate', async () => {
    const failingPreferences: PreferencesSource = {
      getPreferences: jest.fn().mockRejectedValue(new Error('redis down')),
    };

    const result = await hydratePreferences('u1', {
      preferences: failingPreferences,
      knowledge: knowledgeStub(),
    });

    expect(result.vips).toEqual([]); // preferences failed → empty
    expect(result.knowledge).toEqual(['Always CC my assistant', '[rule] never show promos']);
  });
});
