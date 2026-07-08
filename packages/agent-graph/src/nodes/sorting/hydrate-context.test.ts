import { hydrateContext } from './hydrate-context';

import type { HydrateContextDeps } from './hydrate-context';
import type { EmailMetadata } from '@nexus-aec/intelligence';

function meta(o: { id: string; from?: string; subject?: string; snippet?: string }): EmailMetadata {
  return {
    id: o.id,
    from: o.from ?? 'sender@example.com',
    subject: o.subject ?? 'Subject',
    snippet: o.snippet ?? 'snippet',
    receivedAt: new Date('2026-07-01T00:00:00.000Z'),
  };
}

const EMPTY = { senderPreferences: '', evidenceByEmail: {}, knowledgeSnippets: [] };

describe('hydrateContext', () => {
  it('synthesizes sender preferences over the batch senders (deduped + lowercased)', async () => {
    const synthesizePreferences = jest.fn().mockResolvedValue('User archives newsletters');
    const deps: HydrateContextDeps = { senderInsights: { synthesizePreferences } };

    const result = await hydrateContext(
      'u1',
      [meta({ id: 'a', from: 'A@x.com' }), meta({ id: 'b', from: 'a@x.com' })],
      deps
    );

    expect(result.senderPreferences).toBe('User archives newsletters');
    expect(synthesizePreferences).toHaveBeenCalledWith('u1', ['a@x.com']);
  });

  it('gathers per-email RAG evidence (doc IDs) and deduped snippets', async () => {
    const retrieve = jest
      .fn()
      .mockResolvedValue([
        { documentId: 'doc1', content: 'Pump Station 7 is critical', score: 0.9 },
      ]);
    const deps: HydrateContextDeps = { knowledge: { retrieve } };

    const result = await hydrateContext('u1', [meta({ id: 'a', subject: 'Pump 7 status' })], deps);

    expect(result.evidenceByEmail).toEqual({ a: ['doc1'] });
    expect(result.knowledgeSnippets).toContain('Pump Station 7 is critical');
    expect(retrieve).toHaveBeenCalledWith('Pump 7 status snippet', { topK: 3 });
  });

  it('degrades gracefully when a source throws', async () => {
    const deps: HydrateContextDeps = {
      senderInsights: {
        synthesizePreferences: jest.fn().mockRejectedValue(new Error('redis down')),
      },
      knowledge: { retrieve: jest.fn().mockRejectedValue(new Error('supabase down')) },
      logger: { warn: jest.fn() },
    };

    const result = await hydrateContext('u1', [meta({ id: 'a' })], deps);

    expect(result).toEqual(EMPTY);
    expect(deps.logger?.warn).toHaveBeenCalled();
  });

  it('returns empty context when no sources are injected', async () => {
    expect(await hydrateContext('u1', [meta({ id: 'a' })], {})).toEqual(EMPTY);
  });
});
