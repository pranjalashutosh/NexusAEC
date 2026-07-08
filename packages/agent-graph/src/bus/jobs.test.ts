import type { AgentJob, AgentJobResult, PendingAction } from '@nexus-aec/shared-types';
import type { Redis } from 'ioredis';

import {
  ackJob,
  ensureConsumerGroup,
  enqueueJob,
  JOBS_STREAM,
  parseResultMessage,
  parseStreamJobs,
  publishApprovalRequest,
  publishQueueUpdate,
  publishResult,
  readJobs,
  resultChannel,
  WORKER_GROUP,
  type ApprovalRequest,
} from './jobs';

function mockClient(overrides: Partial<Record<string, jest.Mock>> = {}): Redis {
  return {
    xadd: jest.fn().mockResolvedValue('1-0'),
    xgroup: jest.fn().mockResolvedValue('OK'),
    xreadgroup: jest.fn().mockResolvedValue(null),
    xack: jest.fn().mockResolvedValue(1),
    publish: jest.fn().mockResolvedValue(1),
    ...overrides,
  } as unknown as Redis;
}

const job: AgentJob = {
  jobId: 'j1',
  userId: 'u1',
  kind: 'react_task',
  utterance: 'archive this',
  requestedAt: '2026-07-02T10:00:00.000Z',
};

describe('resultChannel', () => {
  it('namespaces per user', () => {
    expect(resultChannel('u1')).toBe('nexus:results:u1');
  });
});

describe('enqueueJob', () => {
  it('XADDs the job JSON with an approximate length cap and returns the entry id', async () => {
    const xadd = jest.fn().mockResolvedValue('5-0');
    const client = mockClient({ xadd });

    const id = await enqueueJob(client, job);

    expect(id).toBe('5-0');
    expect(xadd).toHaveBeenCalledWith(
      JOBS_STREAM,
      'MAXLEN',
      '~',
      10_000,
      '*',
      'data',
      JSON.stringify(job)
    );
  });

  it('honors a custom maxLen', async () => {
    const xadd = jest.fn().mockResolvedValue('1-0');
    const client = mockClient({ xadd });

    await enqueueJob(client, job, { maxLen: 50 });

    expect(xadd).toHaveBeenCalledWith(
      JOBS_STREAM,
      'MAXLEN',
      '~',
      50,
      '*',
      'data',
      JSON.stringify(job)
    );
  });

  it('returns an empty string when XADD yields null', async () => {
    const client = mockClient({ xadd: jest.fn().mockResolvedValue(null) });

    expect(await enqueueJob(client, job)).toBe('');
  });
});

describe('ensureConsumerGroup', () => {
  it('creates the group with MKSTREAM from the backlog start', async () => {
    const xgroup = jest.fn().mockResolvedValue('OK');
    const client = mockClient({ xgroup });

    await ensureConsumerGroup(client);

    expect(xgroup).toHaveBeenCalledWith('CREATE', JOBS_STREAM, WORKER_GROUP, '0', 'MKSTREAM');
  });

  it('treats an existing group (BUSYGROUP) as success', async () => {
    const client = mockClient({
      xgroup: jest
        .fn()
        .mockRejectedValue(new Error('BUSYGROUP Consumer Group name already exists')),
    });

    await expect(ensureConsumerGroup(client)).resolves.toBeUndefined();
  });

  it('rethrows non-BUSYGROUP errors', async () => {
    const client = mockClient({ xgroup: jest.fn().mockRejectedValue(new Error('ECONNRESET')) });

    await expect(ensureConsumerGroup(client)).rejects.toThrow('ECONNRESET');
  });
});

describe('readJobs', () => {
  it('blocks on XREADGROUP for new entries and parses them', async () => {
    const reply = [[JOBS_STREAM, [['1-0', ['data', JSON.stringify(job)]]]]];
    const xreadgroup = jest.fn().mockResolvedValue(reply);
    const client = mockClient({ xreadgroup });

    const jobs = await readJobs(client, { consumer: 'worker-1' });

    expect(jobs).toEqual([{ id: '1-0', job }]);
    expect(xreadgroup).toHaveBeenCalledWith(
      'GROUP',
      WORKER_GROUP,
      'worker-1',
      'COUNT',
      1,
      'BLOCK',
      5000,
      'STREAMS',
      JOBS_STREAM,
      '>'
    );
  });

  it('returns an empty array when the block times out (null reply)', async () => {
    const client = mockClient({ xreadgroup: jest.fn().mockResolvedValue(null) });

    expect(await readJobs(client, { consumer: 'w' })).toEqual([]);
  });
});

describe('ackJob', () => {
  it('XACKs the entry on the stream + group', async () => {
    const xack = jest.fn().mockResolvedValue(1);
    const client = mockClient({ xack });

    await ackJob(client, '1-0');

    expect(xack).toHaveBeenCalledWith(JOBS_STREAM, WORKER_GROUP, '1-0');
  });
});

describe('parseStreamJobs', () => {
  it('parses multiple entries across streams', () => {
    const second: AgentJob = { ...job, jobId: 'j2' };
    const reply = [
      [
        JOBS_STREAM,
        [
          ['1-0', ['data', JSON.stringify(job)]],
          ['2-0', ['data', JSON.stringify(second)]],
        ],
      ],
    ];

    expect(parseStreamJobs(reply)).toEqual([
      { id: '1-0', job },
      { id: '2-0', job: second },
    ]);
  });

  it('skips malformed entries but keeps valid ones', () => {
    const reply = [
      [
        JOBS_STREAM,
        [
          ['1-0', ['data', '{not json']],
          ['2-0', ['data', JSON.stringify(job)]],
          ['3-0', ['other', 'no data field']],
        ],
      ],
    ];

    expect(parseStreamJobs(reply)).toEqual([{ id: '2-0', job }]);
  });

  it('returns [] for a null/non-array reply', () => {
    expect(parseStreamJobs(null)).toEqual([]);
    expect(parseStreamJobs('nope')).toEqual([]);
  });
});

describe('result + approval publishing', () => {
  const result: AgentJobResult = {
    jobId: 'j1',
    userId: 'u1',
    status: 'completed',
    voiceSummary: 'Done.',
  };

  it('publishResult tags the payload and targets the user channel', async () => {
    const publish = jest.fn().mockResolvedValue(2);
    const client = mockClient({ publish });

    const subscribers = await publishResult(client, result);

    expect(subscribers).toBe(2);
    expect(publish).toHaveBeenCalledTimes(1);
    const [channel, payload] = publish.mock.calls[0] as [string, string];
    expect(channel).toBe('nexus:results:u1');
    expect(parseResultMessage(payload)).toEqual({ kind: 'result', result });
  });

  it('publishApprovalRequest tags an approval message', async () => {
    const publish = jest.fn().mockResolvedValue(1);
    const client = mockClient({ publish });
    const pendingAction: PendingAction = {
      id: 'p1',
      tool: 'send_draft',
      args: {},
      riskLevel: 'high',
      status: 'proposed',
      expiresAt: '2026-07-02T10:01:00.000Z',
    };
    const approval: ApprovalRequest = {
      jobId: 'j1',
      userId: 'u1',
      taskId: 't1',
      action: pendingAction,
      prompt: 'Send this draft?',
      expiresAt: '2026-07-02T10:01:00.000Z',
    };

    await publishApprovalRequest(client, approval);

    const [channel, payload] = publish.mock.calls[0] as [string, string];
    expect(channel).toBe('nexus:results:u1');
    expect(parseResultMessage(payload)).toEqual({ kind: 'approval', approval });
  });

  it('publishQueueUpdate tags a queue_updated message on the user channel', async () => {
    const publish = jest.fn().mockResolvedValue(1);
    const client = mockClient({ publish });
    const update = {
      userId: 'u1',
      counts: { high: 2, medium: 1, low: 5 },
      total: 8,
      at: '2026-07-02T10:00:00.000Z',
    };

    await publishQueueUpdate(client, update);

    const [channel, payload] = publish.mock.calls[0] as [string, string];
    expect(channel).toBe('nexus:results:u1');
    expect(parseResultMessage(payload)).toEqual({ kind: 'queue_updated', update });
  });
});

describe('parseResultMessage', () => {
  it('returns null on malformed JSON', () => {
    expect(parseResultMessage('{oops')).toBeNull();
  });
});
