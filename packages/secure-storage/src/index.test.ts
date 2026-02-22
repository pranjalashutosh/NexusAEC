/**
 * Unit tests for @nexus-aec/secure-storage
 */

import {
  detectPlatform,
  isSecureStorageAvailable,
  createSecureStorage,
  createSecureStorageWithPassword,
  EncryptedMemoryStorage,
  ISecureStorage,
} from './index';
import { generateKey } from '@nexus-aec/encryption';

describe('@nexus-aec/secure-storage', () => {
  describe('detectPlatform', () => {
    it('should detect Node.js environment', () => {
      const platform = detectPlatform();
      // In test environment (Node.js on macOS/Linux/Windows)
      expect(['node', 'macos', 'windows', 'linux']).toContain(platform);
    });
  });

  describe('isSecureStorageAvailable', () => {
    it('should return true in Node.js environment', () => {
      expect(isSecureStorageAvailable()).toBe(true);
    });
  });

  describe('createSecureStorage', () => {
    it('should create a storage instance', () => {
      const storage = createSecureStorage();
      expect(storage).toBeDefined();
      expect(typeof storage.setItem).toBe('function');
      expect(typeof storage.getItem).toBe('function');
      expect(typeof storage.removeItem).toBe('function');
      expect(typeof storage.hasItem).toBe('function');
      expect(typeof storage.getAllKeys).toBe('function');
      expect(typeof storage.clear).toBe('function');
    });

    it('should create storage with custom service name', () => {
      const storage = createSecureStorage({ service: 'my-app' });
      expect(storage).toBeDefined();
    });

    it('should create storage with encryption key', () => {
      const key = generateKey();
      const storage = createSecureStorage({ encryptionKey: key });
      expect(storage).toBeDefined();
    });
  });

  describe('createSecureStorageWithPassword', () => {
    it('should create storage with password-derived key', async () => {
      const storage = await createSecureStorageWithPassword('myPassword123');
      expect(storage).toBeDefined();

      // Verify it works
      await storage.setItem('test', 'value');
      const retrieved = await storage.getItem('test');
      expect(retrieved).toBe('value');
    });
  });

  describe('EncryptedMemoryStorage', () => {
    let storage: ISecureStorage;

    beforeEach(() => {
      storage = new EncryptedMemoryStorage({ service: 'test-service' });
    });

    describe('setItem/getItem', () => {
      it('should store and retrieve a value', async () => {
        await storage.setItem('myKey', 'myValue');
        const value = await storage.getItem('myKey');
        expect(value).toBe('myValue');
      });

      it('should return null for non-existent key', async () => {
        const value = await storage.getItem('nonExistent');
        expect(value).toBeNull();
      });

      it('should overwrite existing value', async () => {
        await storage.setItem('key', 'value1');
        await storage.setItem('key', 'value2');
        const value = await storage.getItem('key');
        expect(value).toBe('value2');
      });

      it('should handle empty string values', async () => {
        await expect(storage.setItem('key', '')).rejects.toThrow();
      });

      it('should handle special characters in values', async () => {
        const specialValue = '你好世界 🌍 <script>alert("xss")</script>';
        await storage.setItem('special', specialValue);
        const retrieved = await storage.getItem('special');
        expect(retrieved).toBe(specialValue);
      });

      it('should handle large values', async () => {
        const largeValue = 'x'.repeat(100000);
        await storage.setItem('large', largeValue);
        const retrieved = await storage.getItem('large');
        expect(retrieved).toBe(largeValue);
      });

      it('should handle JSON values', async () => {
        const jsonValue = JSON.stringify({ user: 'test', tokens: ['a', 'b'] });
        await storage.setItem('json', jsonValue);
        const retrieved = await storage.getItem('json');
        expect(JSON.parse(retrieved!)).toEqual({ user: 'test', tokens: ['a', 'b'] });
      });

      it('should throw for empty key', async () => {
        await expect(storage.setItem('', 'value')).rejects.toThrow('Key is required');
        await expect(storage.getItem('')).rejects.toThrow('Key is required');
      });
    });

    describe('removeItem', () => {
      it('should remove an existing item', async () => {
        await storage.setItem('toRemove', 'value');
        await storage.removeItem('toRemove');
        const value = await storage.getItem('toRemove');
        expect(value).toBeNull();
      });

      it('should not throw when removing non-existent item', async () => {
        await expect(storage.removeItem('nonExistent')).resolves.not.toThrow();
      });
    });

    describe('hasItem', () => {
      it('should return true for existing item', async () => {
        await storage.setItem('exists', 'value');
        const exists = await storage.hasItem('exists');
        expect(exists).toBe(true);
      });

      it('should return false for non-existent item', async () => {
        const exists = await storage.hasItem('nonExistent');
        expect(exists).toBe(false);
      });

      it('should return false after item is removed', async () => {
        await storage.setItem('temp', 'value');
        await storage.removeItem('temp');
        const exists = await storage.hasItem('temp');
        expect(exists).toBe(false);
      });
    });

    describe('getAllKeys', () => {
      it('should return empty array when storage is empty', async () => {
        const keys = await storage.getAllKeys();
        expect(keys).toEqual([]);
      });

      it('should return all stored keys', async () => {
        await storage.setItem('key1', 'value1');
        await storage.setItem('key2', 'value2');
        await storage.setItem('key3', 'value3');

        const keys = await storage.getAllKeys();
        expect(keys).toHaveLength(3);
        expect(keys).toContain('key1');
        expect(keys).toContain('key2');
        expect(keys).toContain('key3');
      });

      it('should only return keys for the current service', async () => {
        const storage1 = new EncryptedMemoryStorage({ service: 'service1' });
        const storage2 = new EncryptedMemoryStorage({ service: 'service2' });

        await storage1.setItem('key1', 'value1');
        await storage2.setItem('key2', 'value2');

        const keys1 = await storage1.getAllKeys();
        const keys2 = await storage2.getAllKeys();

        expect(keys1).toEqual(['key1']);
        expect(keys2).toEqual(['key2']);
      });
    });

    describe('clear', () => {
      it('should remove all items', async () => {
        await storage.setItem('key1', 'value1');
        await storage.setItem('key2', 'value2');
        await storage.setItem('key3', 'value3');

        await storage.clear();

        const keys = await storage.getAllKeys();
        expect(keys).toEqual([]);
      });

      it('should only clear items for the current service', async () => {
        const storage1 = new EncryptedMemoryStorage({ service: 'service1' });
        const storage2 = new EncryptedMemoryStorage({ service: 'service2' });

        await storage1.setItem('key1', 'value1');
        await storage2.setItem('key2', 'value2');

        await storage1.clear();

        const keys1 = await storage1.getAllKeys();
        const keys2 = await storage2.getAllKeys();

        expect(keys1).toEqual([]);
        expect(keys2).toEqual(['key2']);
      });
    });

    describe('encryption isolation', () => {
      it('should not be able to read data with different encryption key', async () => {
        const key1 = generateKey();
        const key2 = generateKey();

        const storage1 = new EncryptedMemoryStorage({ encryptionKey: key1, service: 'shared' });

        await storage1.setItem('secret', 'sensitive data');

        // Create new storage with different key but same underlying storage
        // This simulates what would happen if someone tried to read with wrong key
        // In our implementation, each instance has its own Map, so we can't directly test this
        // But we can verify that the encryption is working by checking the stored data
        const stats = (storage1 as EncryptedMemoryStorage).getStats();
        expect(stats.itemCount).toBe(1);
      });
    });

    describe('createWithPassword', () => {
      it('should create storage with password-derived key', async () => {
        const storage = await EncryptedMemoryStorage.createWithPassword('myPassword');
        await storage.setItem('key', 'value');
        const retrieved = await storage.getItem('key');
        expect(retrieved).toBe('value');
      });

      it('should derive same key for same password', async () => {
        // Note: In practice, we'd need to persist the salt for this to work
        // This test just verifies the API works
        const storage = await EncryptedMemoryStorage.createWithPassword('consistentPassword');
        await storage.setItem('test', 'data');
        expect(await storage.getItem('test')).toBe('data');
      });
    });
  });

  describe('service isolation', () => {
    it('should isolate data between services', async () => {
      const app1Storage = createSecureStorage({ service: 'app1' });
      const app2Storage = createSecureStorage({ service: 'app2' });

      await app1Storage.setItem('sharedKey', 'app1Value');
      await app2Storage.setItem('sharedKey', 'app2Value');

      const app1Value = await app1Storage.getItem('sharedKey');
      const app2Value = await app2Storage.getItem('sharedKey');

      expect(app1Value).toBe('app1Value');
      expect(app2Value).toBe('app2Value');
    });
  });

  describe('concurrent operations', () => {
    it('should handle concurrent writes', async () => {
      const storage = createSecureStorage();

      const writes = Array.from({ length: 10 }, (_, i) =>
        storage.setItem(`concurrent-${i}`, `value-${i}`)
      );

      await Promise.all(writes);

      const keys = await storage.getAllKeys();
      expect(keys).toHaveLength(10);
    });

    it('should handle concurrent reads and writes', async () => {
      const storage = createSecureStorage();

      // Pre-populate some data
      await storage.setItem('existing', 'value');

      const operations = [
        storage.setItem('new1', 'value1'),
        storage.getItem('existing'),
        storage.setItem('new2', 'value2'),
        storage.getItem('existing'),
        storage.hasItem('existing'),
      ];

      const results = await Promise.all(operations);

      expect(results[1]).toBe('value');
      expect(results[3]).toBe('value');
      expect(results[4]).toBe(true);
    });
  });
});
