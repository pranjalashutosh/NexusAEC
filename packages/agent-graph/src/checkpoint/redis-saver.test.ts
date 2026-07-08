import { Annotation, END, START, StateGraph } from '@langchain/langgraph';
import RedisMock from 'ioredis-mock';

import type { Redis } from 'ioredis';

import { RedisSaver } from './redis-saver';

/** A trivial graph that adds 1 to a reduced counter each run. */
function counterGraph(saver: RedisSaver) {
  const State = Annotation.Root({
    count: Annotation<number>({ reducer: (a, b) => a + b, default: () => 0 }),
  });
  return new StateGraph(State)
    .addNode('inc', () => ({ count: 1 }))
    .addEdge(START, 'inc')
    .addEdge('inc', END)
    .compile({ checkpointer: saver });
}

function newClient(): Redis {
  return new RedisMock() as unknown as Redis;
}

describe('RedisSaver', () => {
  it('persists reduced state across separate invocations on the same thread', async () => {
    const saver = new RedisSaver({ client: newClient() });
    const graph = counterGraph(saver);
    const config = { configurable: { thread_id: 't1' } };

    await graph.invoke({}, config);
    await graph.invoke({}, config);

    const state = await graph.getState(config);
    expect(state.values['count']).toBe(2);
  });

  it('isolates state by thread_id', async () => {
    const saver = new RedisSaver({ client: newClient() });
    const graph = counterGraph(saver);

    await graph.invoke({}, { configurable: { thread_id: 'a' } });
    await graph.invoke({}, { configurable: { thread_id: 'b' } });
    await graph.invoke({}, { configurable: { thread_id: 'b' } });

    expect((await graph.getState({ configurable: { thread_id: 'a' } })).values['count']).toBe(1);
    expect((await graph.getState({ configurable: { thread_id: 'b' } })).values['count']).toBe(2);
  });

  it('returns undefined for an unknown thread', async () => {
    const saver = new RedisSaver({ client: newClient() });

    const tuple = await saver.getTuple({ configurable: { thread_id: 'missing' } });

    expect(tuple).toBeUndefined();
  });

  it('lists checkpoints for a thread newest-first', async () => {
    const saver = new RedisSaver({ client: newClient() });
    const graph = counterGraph(saver);
    const config = { configurable: { thread_id: 't1' } };

    await graph.invoke({}, config);

    const tuples = [];
    for await (const tuple of saver.list(config)) {
      tuples.push(tuple);
    }

    expect(tuples.length).toBeGreaterThan(0);
    expect(tuples[0]?.config.configurable?.['thread_id']).toBe('t1');
    // Descending checkpoint ids (uuid6 is time-ordered).
    const ids = tuples.map((t) => t.config.configurable?.['checkpoint_id'] as string);
    const sortedDesc = [...ids].sort((a, b) => b.localeCompare(a));
    expect(ids).toEqual(sortedDesc);
  });

  it('sets a rolling TTL on the thread key', async () => {
    const client = newClient();
    const saver = new RedisSaver({ client, ttlSeconds: 100 });
    const graph = counterGraph(saver);

    await graph.invoke({}, { configurable: { thread_id: 't1' } });

    const ttl = await client.ttl('nexus:graph:t1');
    expect(ttl).toBeGreaterThan(0);
    expect(ttl).toBeLessThanOrEqual(100);
  });

  it('honors a custom key prefix', async () => {
    const client = newClient();
    const saver = new RedisSaver({ client, keyPrefix: 'test:cp:' });
    const graph = counterGraph(saver);

    await graph.invoke({}, { configurable: { thread_id: 't1' } });

    expect(await client.get('test:cp:t1')).not.toBeNull();
  });

  it('deleteThread removes all persisted state for the thread', async () => {
    const client = newClient();
    const saver = new RedisSaver({ client });
    const graph = counterGraph(saver);
    const config = { configurable: { thread_id: 't1' } };

    await graph.invoke({}, config);
    await saver.deleteThread('t1');

    expect(await client.get('nexus:graph:t1')).toBeNull();
    expect(await saver.getTuple(config)).toBeUndefined();
  });

  it('rejects prototype-pollution checkpoint namespaces', async () => {
    const saver = new RedisSaver({ client: newClient() });

    await expect(
      saver.getTuple({ configurable: { thread_id: 't1', checkpoint_ns: '__proto__' } })
    ).rejects.toThrow(/Unsafe/);
  });
});
