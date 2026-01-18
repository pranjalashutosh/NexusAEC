/**
 * Tests for PreferencesStore
 */

import {
  PreferencesStore,
  type VipContact,
  type CustomKeyword,
  type TopicPreference,
  type MutedSender,
  type UserPreferences,
} from '../preferences-store';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock fs module
jest.mock('fs/promises');

const mockFs = fs as jest.Mocked<typeof fs>;

describe('PreferencesStore', () => {
  const testStoragePath = '/tmp/test-preferences';
  const testEncryptionKey = PreferencesStore.generateEncryptionKey();
  let store: PreferencesStore;
  let mockSyncCallback: jest.Mock;

  beforeEach(() => {
    mockFs.mkdir.mockResolvedValue(undefined);
    mockFs.writeFile.mockResolvedValue(undefined);
    mockFs.readFile.mockRejectedValue(new Error('File not found')); // Default to no existing file

    mockSyncCallback = jest.fn().mockResolvedValue(undefined);

    store = new PreferencesStore({
      storagePath: testStoragePath,
      encryptionKey: testEncryptionKey,
      autoSync: false,
      debug: false,
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with valid options', () => {
      expect(store).toBeInstanceOf(PreferencesStore);
    });

    it('should throw error with invalid encryption key length', () => {
      expect(
        () =>
          new PreferencesStore({
            storagePath: testStoragePath,
            encryptionKey: 'short', // Too short
            autoSync: false,
          })
      ).toThrow('Encryption key must be 32 bytes');
    });
  });

  describe('initialize', () => {
    it('should create storage directory', async () => {
      await store.initialize();

      expect(mockFs.mkdir).toHaveBeenCalledWith(testStoragePath, { recursive: true });
    });

    it('should create new preferences file if none exists', async () => {
      await store.initialize();

      expect(mockFs.writeFile).toHaveBeenCalled();
      const writeCall = mockFs.writeFile.mock.calls[0];
      expect(writeCall[0]).toBe(path.join(testStoragePath, 'preferences.enc'));
    });

    it('should load existing preferences if file exists', async () => {
      // Mock existing encrypted file
      const mockPrefs: UserPreferences = {
        vips: [],
        keywords: [],
        topics: [],
        mutedSenders: [],
        lastModified: new Date(),
        version: 1,
      };

      // Create a real store to encrypt data
      const tempStore = new PreferencesStore({
        storagePath: testStoragePath,
        encryptionKey: testEncryptionKey,
      });
      const encrypted = (tempStore as any).encrypt(JSON.stringify(mockPrefs));

      mockFs.readFile.mockResolvedValue(encrypted);

      await store.initialize();

      const prefs = await store.getPreferences();
      expect(prefs.version).toBe(1);
    });
  });

  describe('VIP management', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should add VIP contact', async () => {
      await store.addVip({
        identifier: 'vip@example.com',
        name: 'VIP User',
        note: 'Important client',
      });

      const vips = await store.getVips();
      expect(vips.length).toBe(1);
      expect(vips[0].identifier).toBe('vip@example.com');
      expect(vips[0].name).toBe('VIP User');
      expect(vips[0].addedAt).toBeInstanceOf(Date);
    });

    it('should throw error when adding duplicate VIP', async () => {
      await store.addVip({
        identifier: 'vip@example.com',
        name: 'VIP User',
      });

      await expect(
        store.addVip({
          identifier: 'vip@example.com',
          name: 'Another Name',
        })
      ).rejects.toThrow('VIP already exists');
    });

    it('should remove VIP contact', async () => {
      await store.addVip({
        identifier: 'vip@example.com',
        name: 'VIP User',
      });

      await store.removeVip('vip@example.com');

      const vips = await store.getVips();
      expect(vips.length).toBe(0);
    });

    it('should throw error when removing non-existent VIP', async () => {
      await expect(store.removeVip('nonexistent@example.com')).rejects.toThrow('VIP not found');
    });

    it('should check if email is VIP (exact match)', async () => {
      await store.addVip({
        identifier: 'vip@example.com',
        name: 'VIP User',
      });

      expect(await store.isVip('vip@example.com')).toBe(true);
      expect(await store.isVip('VIP@EXAMPLE.COM')).toBe(true); // Case insensitive
      expect(await store.isVip('other@example.com')).toBe(false);
    });

    it('should check if email is VIP (domain match)', async () => {
      await store.addVip({
        identifier: '@vipcompany.com',
        name: 'VIP Company',
      });

      expect(await store.isVip('anyone@vipcompany.com')).toBe(true);
      expect(await store.isVip('user@other.com')).toBe(false);
    });

    it('should get all VIPs', async () => {
      await store.addVip({ identifier: 'vip1@example.com', name: 'VIP 1' });
      await store.addVip({ identifier: 'vip2@example.com', name: 'VIP 2' });

      const vips = await store.getVips();
      expect(vips.length).toBe(2);
    });
  });

  describe('keyword management', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should add custom keyword', async () => {
      await store.addKeyword({
        pattern: 'urgent',
        isRegex: false,
        weight: 0.9,
        category: 'priority',
      });

      const keywords = await store.getKeywords();
      expect(keywords.length).toBe(1);
      expect(keywords[0].pattern).toBe('urgent');
      expect(keywords[0].weight).toBe(0.9);
    });

    it('should throw error when adding duplicate keyword', async () => {
      await store.addKeyword({
        pattern: 'urgent',
        isRegex: false,
        weight: 0.9,
      });

      await expect(
        store.addKeyword({
          pattern: 'urgent',
          isRegex: false,
          weight: 0.8,
        })
      ).rejects.toThrow('Keyword already exists');
    });

    it('should remove keyword', async () => {
      await store.addKeyword({
        pattern: 'urgent',
        isRegex: false,
        weight: 0.9,
      });

      await store.removeKeyword('urgent');

      const keywords = await store.getKeywords();
      expect(keywords.length).toBe(0);
    });

    it('should throw error when removing non-existent keyword', async () => {
      await expect(store.removeKeyword('nonexistent')).rejects.toThrow('Keyword not found');
    });

    it('should get all keywords', async () => {
      await store.addKeyword({ pattern: 'urgent', isRegex: false, weight: 0.9 });
      await store.addKeyword({ pattern: 'critical', isRegex: false, weight: 0.95 });

      const keywords = await store.getKeywords();
      expect(keywords.length).toBe(2);
    });
  });

  describe('topic preference management', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should set topic preference', async () => {
      await store.setTopicPreference({
        topic: 'Project Updates',
        priority: 0.8,
        muted: false,
      });

      const topics = await store.getTopicPreferences();
      expect(topics.length).toBe(1);
      expect(topics[0].topic).toBe('Project Updates');
      expect(topics[0].priority).toBe(0.8);
    });

    it('should update existing topic preference', async () => {
      await store.setTopicPreference({
        topic: 'Project Updates',
        priority: 0.8,
        muted: false,
      });

      await store.setTopicPreference({
        topic: 'Project Updates',
        priority: 0.9,
        muted: true,
      });

      const topics = await store.getTopicPreferences();
      expect(topics.length).toBe(1);
      expect(topics[0].priority).toBe(0.9);
      expect(topics[0].muted).toBe(true);
    });

    it('should remove topic preference', async () => {
      await store.setTopicPreference({
        topic: 'Project Updates',
        priority: 0.8,
        muted: false,
      });

      await store.removeTopicPreference('Project Updates');

      const topics = await store.getTopicPreferences();
      expect(topics.length).toBe(0);
    });

    it('should throw error when removing non-existent topic', async () => {
      await expect(store.removeTopicPreference('Nonexistent')).rejects.toThrow(
        'Topic preference not found'
      );
    });
  });

  describe('muted sender management', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should mute sender', async () => {
      await store.muteSender({
        identifier: 'spam@example.com',
        reason: 'Too many promotional emails',
      });

      const muted = await store.getMutedSenders();
      expect(muted.length).toBe(1);
      expect(muted[0].identifier).toBe('spam@example.com');
    });

    it('should throw error when muting already muted sender', async () => {
      await store.muteSender({
        identifier: 'spam@example.com',
        reason: 'Spam',
      });

      await expect(
        store.muteSender({
          identifier: 'spam@example.com',
          reason: 'More spam',
        })
      ).rejects.toThrow('Sender already muted');
    });

    it('should unmute sender', async () => {
      await store.muteSender({
        identifier: 'spam@example.com',
        reason: 'Spam',
      });

      await store.unmuteSender('spam@example.com');

      const muted = await store.getMutedSenders();
      expect(muted.length).toBe(0);
    });

    it('should throw error when unmuting non-muted sender', async () => {
      await expect(store.unmuteSender('nonexistent@example.com')).rejects.toThrow(
        'Muted sender not found'
      );
    });

    it('should check if sender is muted (exact match)', async () => {
      await store.muteSender({
        identifier: 'spam@example.com',
        reason: 'Spam',
      });

      expect(await store.isMuted('spam@example.com')).toBe(true);
      expect(await store.isMuted('SPAM@EXAMPLE.COM')).toBe(true); // Case insensitive
      expect(await store.isMuted('other@example.com')).toBe(false);
    });

    it('should check if sender is muted (domain match)', async () => {
      await store.muteSender({
        identifier: '@spamcompany.com',
        reason: 'Spam domain',
      });

      expect(await store.isMuted('anyone@spamcompany.com')).toBe(true);
      expect(await store.isMuted('user@other.com')).toBe(false);
    });

    it('should exclude expired muted senders', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 1);

      await store.muteSender({
        identifier: 'expired@example.com',
        reason: 'Temporary mute',
        expiresAt: pastDate,
      });

      expect(await store.isMuted('expired@example.com')).toBe(false);
      const muted = await store.getMutedSenders();
      expect(muted.length).toBe(0);
    });

    it('should include non-expired muted senders', async () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 1);

      await store.muteSender({
        identifier: 'temp@example.com',
        reason: 'Temporary mute',
        expiresAt: futureDate,
      });

      expect(await store.isMuted('temp@example.com')).toBe(true);
      const muted = await store.getMutedSenders();
      expect(muted.length).toBe(1);
    });
  });

  describe('preferences management', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should get all preferences', async () => {
      await store.addVip({ identifier: 'vip@example.com', name: 'VIP' });
      await store.addKeyword({ pattern: 'urgent', isRegex: false, weight: 0.9 });

      const prefs = await store.getPreferences();

      expect(prefs.vips.length).toBe(1);
      expect(prefs.keywords.length).toBe(1);
      expect(prefs.version).toBeGreaterThan(0);
      expect(prefs.lastModified).toBeInstanceOf(Date);
    });

    it('should clear all preferences', async () => {
      await store.addVip({ identifier: 'vip@example.com', name: 'VIP' });
      await store.addKeyword({ pattern: 'urgent', isRegex: false, weight: 0.9 });

      await store.clear();

      const prefs = await store.getPreferences();
      expect(prefs.vips.length).toBe(0);
      expect(prefs.keywords.length).toBe(0);
      expect(prefs.version).toBe(0);
    });
  });

  describe('import/export', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should export preferences', async () => {
      await store.addVip({ identifier: 'vip@example.com', name: 'VIP' });

      const exported = await store.exportPreferences();

      expect(exported.vips.length).toBe(1);
      expect(exported.vips[0].identifier).toBe('vip@example.com');
    });

    it('should import preferences with remote strategy', async () => {
      await store.addVip({ identifier: 'local@example.com', name: 'Local VIP' });

      const remotePrefs: UserPreferences = {
        vips: [{ identifier: 'remote@example.com', name: 'Remote VIP', addedAt: new Date() }],
        keywords: [],
        topics: [],
        mutedSenders: [],
        lastModified: new Date(),
        version: 5,
      };

      await store.importPreferences(remotePrefs, 'remote');

      const prefs = await store.getPreferences();
      expect(prefs.vips.length).toBe(1);
      expect(prefs.vips[0].identifier).toBe('remote@example.com');
    });

    it('should import preferences with local strategy', async () => {
      await store.addVip({ identifier: 'local@example.com', name: 'Local VIP' });

      const remotePrefs: UserPreferences = {
        vips: [{ identifier: 'remote@example.com', name: 'Remote VIP', addedAt: new Date() }],
        keywords: [],
        topics: [],
        mutedSenders: [],
        lastModified: new Date(),
        version: 5,
      };

      await store.importPreferences(remotePrefs, 'local');

      const prefs = await store.getPreferences();
      expect(prefs.vips.length).toBe(1);
      expect(prefs.vips[0].identifier).toBe('local@example.com');
    });

    it('should import preferences with merge strategy', async () => {
      await store.addVip({ identifier: 'local@example.com', name: 'Local VIP' });

      const remotePrefs: UserPreferences = {
        vips: [{ identifier: 'remote@example.com', name: 'Remote VIP', addedAt: new Date() }],
        keywords: [],
        topics: [],
        mutedSenders: [],
        lastModified: new Date(),
        version: 1,
      };

      await store.importPreferences(remotePrefs, 'merge');

      const prefs = await store.getPreferences();
      expect(prefs.vips.length).toBe(2); // Both local and remote
      expect(prefs.vips.some((v) => v.identifier === 'local@example.com')).toBe(true);
      expect(prefs.vips.some((v) => v.identifier === 'remote@example.com')).toBe(true);
    });

    it('should use remote version when higher in merge', async () => {
      const remotePrefs: UserPreferences = {
        vips: [{ identifier: 'remote@example.com', name: 'Remote VIP', addedAt: new Date() }],
        keywords: [],
        topics: [],
        mutedSenders: [],
        lastModified: new Date(),
        version: 10, // Higher version
      };

      await store.importPreferences(remotePrefs, 'merge');

      const prefs = await store.getPreferences();
      expect(prefs.version).toBe(10);
      expect(prefs.vips[0].identifier).toBe('remote@example.com');
    });
  });

  describe('auto-sync', () => {
    it('should call sync callback when auto-sync is enabled', async () => {
      const syncStore = new PreferencesStore({
        storagePath: testStoragePath,
        encryptionKey: testEncryptionKey,
        autoSync: true,
        onSync: mockSyncCallback,
      });

      await syncStore.initialize();
      await syncStore.addVip({ identifier: 'vip@example.com', name: 'VIP' });

      expect(mockSyncCallback).toHaveBeenCalledTimes(2); // Once for init, once for addVip
      expect(mockSyncCallback).toHaveBeenCalledWith(expect.objectContaining({ version: 1 }));
    });

    it('should not call sync callback when auto-sync is disabled', async () => {
      await store.initialize();
      await store.addVip({ identifier: 'vip@example.com', name: 'VIP' });

      expect(mockSyncCallback).not.toHaveBeenCalled();
    });

    it('should handle sync failures gracefully', async () => {
      mockSyncCallback.mockRejectedValue(new Error('Sync failed'));

      const syncStore = new PreferencesStore({
        storagePath: testStoragePath,
        encryptionKey: testEncryptionKey,
        autoSync: true,
        onSync: mockSyncCallback,
        debug: false,
      });

      await syncStore.initialize();

      // Should not throw
      await expect(syncStore.addVip({ identifier: 'vip@example.com', name: 'VIP' })).resolves.not.toThrow();
    });
  });

  describe('encryption', () => {
    it('should encrypt and decrypt data correctly', async () => {
      await store.initialize();
      await store.addVip({ identifier: 'vip@example.com', name: 'VIP' });

      // The data should be encrypted when written
      const writeCall = mockFs.writeFile.mock.calls[mockFs.writeFile.mock.calls.length - 1];
      const encryptedData = writeCall[1] as Buffer;

      // Encrypted data should not contain plaintext
      expect(encryptedData.toString()).not.toContain('vip@example.com');
    });

    it('should generate valid encryption key', () => {
      const key = PreferencesStore.generateEncryptionKey();

      expect(key).toHaveLength(64); // 32 bytes as hex string
      expect(/^[0-9a-f]{64}$/.test(key)).toBe(true);
    });
  });

  describe('version management', () => {
    beforeEach(async () => {
      await store.initialize();
    });

    it('should increment version on changes', async () => {
      const initialPrefs = await store.getPreferences();
      const initialVersion = initialPrefs.version;

      await store.addVip({ identifier: 'vip@example.com', name: 'VIP' });

      const updatedPrefs = await store.getPreferences();
      expect(updatedPrefs.version).toBe(initialVersion + 1);
    });

    it('should update lastModified on changes', async () => {
      const initialPrefs = await store.getPreferences();
      const initialModified = initialPrefs.lastModified;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 10));

      await store.addVip({ identifier: 'vip@example.com', name: 'VIP' });

      const updatedPrefs = await store.getPreferences();
      expect(updatedPrefs.lastModified.getTime()).toBeGreaterThan(initialModified.getTime());
    });
  });
});
