import { RedisTokenStorage } from './redis-token-storage';

import type { Redis } from 'ioredis';

/** Minimal in-memory stand-in for the ioredis surface the store touches. */
class FakeRedis {
  readonly store = new Map<string, string>();
  readonly setArgs: Array<{ key: string; value: string; mode: string; ttl: number }> = [];

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.store.get(key) ?? null);
  }

  set(key: string, value: string, mode: string, ttl: number): Promise<'OK'> {
    this.setArgs.push({ key, value, mode, ttl });
    this.store.set(key, value);
    return Promise.resolve('OK');
  }

  del(key: string): Promise<number> {
    return Promise.resolve(this.store.delete(key) ? 1 : 0);
  }

  exists(key: string): Promise<number> {
    return Promise.resolve(this.store.has(key) ? 1 : 0);
  }
}

const asRedis = (fake: FakeRedis): Redis => fake as unknown as Redis;

const PASSWORD = 'test-encryption-password';

describe('RedisTokenStorage', () => {
  it('round-trips a value, encrypting it at rest under the nexus:tokens: key with a 90-day TTL', async () => {
    const fake = new FakeRedis();
    const storage = new RedisTokenStorage(asRedis(fake), PASSWORD);

    await storage.set('user1:gmail', 'secret-token');

    const call = fake.setArgs[0];
    expect(call).toMatchObject({
      key: 'nexus:tokens:user1:gmail',
      mode: 'EX',
      ttl: 90 * 24 * 60 * 60,
    });
    // Persisted blob is ciphertext, never the plaintext token.
    expect(fake.store.get('nexus:tokens:user1:gmail')).not.toBe('secret-token');
    // ...and decrypts back to the original on read.
    expect(await storage.get('user1:gmail')).toBe('secret-token');
  });

  it('stores plaintext when no encryption password is set', async () => {
    const fake = new FakeRedis();
    const storage = new RedisTokenStorage(asRedis(fake), '');

    await storage.set('k', 'plain');

    expect(fake.store.get('nexus:tokens:k')).toBe('plain');
    expect(await storage.get('k')).toBe('plain');
  });

  it('supports has() and delete()', async () => {
    const fake = new FakeRedis();
    const storage = new RedisTokenStorage(asRedis(fake), PASSWORD);

    await storage.set('k', 'v');
    expect(await storage.has('k')).toBe(true);

    await storage.delete('k');
    expect(await storage.has('k')).toBe(false);
    expect(await storage.get('k')).toBeNull();
  });

  it('is null-safe and resolves a provider lazily on every call', async () => {
    const fake = new FakeRedis();
    let client: Redis | null = null;
    const storage = new RedisTokenStorage(() => client, PASSWORD);

    // While the provider yields null, reads/writes degrade gracefully.
    await storage.set('k', 'v');
    expect(await storage.get('k')).toBeNull();
    expect(await storage.has('k')).toBe(false);
    expect(fake.store.size).toBe(0);

    // Once the client is available, the same store starts working — no re-construction.
    client = asRedis(fake);
    await storage.set('k', 'v');
    expect(await storage.get('k')).toBe('v');
  });

  it('swallows client errors — reads return null / false, writes resolve', async () => {
    const throwing = {
      get: () => Promise.reject(new Error('boom')),
      set: () => Promise.reject(new Error('boom')),
      del: () => Promise.reject(new Error('boom')),
      exists: () => Promise.reject(new Error('boom')),
    } as unknown as Redis;
    const storage = new RedisTokenStorage(throwing, PASSWORD);

    await expect(storage.get('k')).resolves.toBeNull();
    await expect(storage.has('k')).resolves.toBe(false);
    await expect(storage.set('k', 'v')).resolves.toBeUndefined();
    await expect(storage.delete('k')).resolves.toBeUndefined();
  });
});
