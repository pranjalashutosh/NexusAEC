import { buildClassifyMessages, classifyBatch, parseClassification } from './classify-sort';

import type { ClassifyFn, RawClassification } from './classify-sort';
import type { EmailMetadata } from '@nexus-aec/intelligence';

function meta(o: {
  id: string;
  from?: string;
  subject?: string;
  snippet?: string;
  isVip?: boolean;
  threadId?: string;
}): EmailMetadata {
  return {
    id: o.id,
    from: o.from ?? 'sender@example.com',
    subject: o.subject ?? 'Subject line',
    snippet: o.snippet ?? 'snippet',
    receivedAt: new Date('2026-07-01T00:00:00.000Z'),
    ...(o.threadId ? { threadId: o.threadId } : {}),
    ...(o.isVip !== undefined ? { isVip: o.isVip } : {}),
  };
}

describe('buildClassifyMessages', () => {
  it('emits priority + summary rules and a numbered list, with NO CLUSTER step', () => {
    const [system, user] = buildClassifyMessages(
      [meta({ id: 'e1', subject: 'Invoice' })],
      ['vip@x.com'],
      {
        senderPreferences: 'You reply fast to Acme',
        knowledgeSnippets: ['Bridge 12 is high-risk'],
      }
    );

    expect(system?.role).toBe('system');
    expect(system?.content).toContain('PRIORITIZE');
    expect(system?.content).toContain('6 to 14');
    expect(system?.content).not.toContain('CLUSTER');
    expect(system?.content).toContain('VIP contacts (always HIGH): vip@x.com');
    expect(system?.content).toContain('You reply fast to Acme');
    expect(system?.content).toContain('Bridge 12 is high-risk');
    expect(user?.content).toContain('id:e1');
    expect(user?.content).toContain('Invoice');
  });
});

describe('parseClassification', () => {
  const batch = [
    meta({ id: 'a', subject: 'Deploy prod', threadId: 'ta' }),
    meta({ id: 'b', subject: 'Newsletter', isVip: true }),
  ];

  it('maps classifications onto queue items, preserving batch order', () => {
    const raw: RawClassification[] = [
      { emailId: 'b', priority: 'low', summary: 'shares weekly updates' },
      { emailId: 'a', priority: 'high', summary: 'wants prod deploy approved' },
    ];

    const items = parseClassification(raw, batch);

    expect(items.map((i) => i.emailId)).toEqual(['a', 'b']);
    expect(items[0]).toMatchObject({
      emailId: 'a',
      threadId: 'ta',
      from: 'sender@example.com',
      subject: 'Deploy prod',
      priority: 'high',
      summary: 'wants prod deploy approved',
      status: 'pending',
    });
    expect(items[0]?.receivedAt).toBe('2026-07-01T00:00:00.000Z');
    expect(items[1]).toMatchObject({ emailId: 'b', priority: 'low' });
  });

  it('falls back to an EMPTY summary (never the subject) for missing classifications', () => {
    const items = parseClassification([], batch);

    expect(items[0]).toMatchObject({ emailId: 'a', priority: 'medium', summary: '' });
    // VIP with no classification falls back to high.
    expect(items[1]).toMatchObject({ emailId: 'b', priority: 'high', summary: '' });
  });

  it('blanks a summary that merely echoes the subject line', () => {
    const raw: RawClassification[] = [{ emailId: 'a', priority: 'high', summary: 'deploy prod' }];

    const items = parseClassification(raw, [meta({ id: 'a', subject: 'Deploy prod' })]);

    expect(items[0]?.summary).toBe('');
  });

  it('attaches ragEvidence when present', () => {
    const items = parseClassification(
      [{ emailId: 'a', priority: 'high', summary: 'ok summary' }],
      [meta({ id: 'a' })],
      { evidenceByEmail: { a: ['doc1', 'doc2'] } }
    );

    expect(items[0]?.ragEvidence).toEqual(['doc1', 'doc2']);
  });

  it('coerces an invalid priority to the metadata fallback', () => {
    const raw = [
      { emailId: 'a', priority: 'urgent', summary: 'x' },
    ] as unknown as RawClassification[];

    const items = parseClassification(raw, [meta({ id: 'a' })]);

    expect(items[0]?.priority).toBe('medium');
  });
});

describe('classifyBatch', () => {
  const batch = [meta({ id: 'a', subject: 'S' })];

  it('uses the injected classify fn', async () => {
    const classify: ClassifyFn = jest
      .fn()
      .mockResolvedValue([{ emailId: 'a', priority: 'high', summary: 'wants a call' }]);

    const items = await classifyBatch(batch, [], {}, classify);

    expect(items[0]).toMatchObject({ priority: 'high', summary: 'wants a call' });
  });

  it('falls back (empty summary, never the subject) when the classify fn throws', async () => {
    const classify: ClassifyFn = jest.fn().mockRejectedValue(new Error('llm down'));

    const items = await classifyBatch(batch, [], {}, classify);

    expect(items[0]).toMatchObject({ emailId: 'a', summary: '' });
  });
});
