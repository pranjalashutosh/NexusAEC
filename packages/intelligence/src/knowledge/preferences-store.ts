/**
 * Preferences Store (Tier 3)
 *
 * Manages user preferences with encrypted local storage and sync capabilities.
 * Stores VIPs, keywords, topics, and muted senders for personalized email intelligence.
 */

import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * VIP contact
 */
export interface VipContact {
  /**
   * Email address or domain
   */
  identifier: string;

  /**
   * Display name
   */
  name?: string;

  /**
   * Optional note
   */
  note?: string;

  /**
   * When added
   */
  addedAt: Date;
}

/**
 * Custom keyword
 */
export interface CustomKeyword {
  /**
   * Keyword pattern (can be regex)
   */
  pattern: string;

  /**
   * Whether pattern is regex
   */
  isRegex: boolean;

  /**
   * Severity weight (0.0-1.0)
   */
  weight: number;

  /**
   * Optional category
   */
  category?: string;

  /**
   * When added
   */
  addedAt: Date;
}

/**
 * Topic preference
 */
export interface TopicPreference {
  /**
   * Topic name
   */
  topic: string;

  /**
   * Priority level (0-1, higher = more important)
   */
  priority: number;

  /**
   * Whether to mute this topic
   */
  muted: boolean;

  /**
   * When added
   */
  addedAt: Date;
}

/**
 * Muted sender
 */
export interface MutedSender {
  /**
   * Email address or domain
   */
  identifier: string;

  /**
   * Reason for muting
   */
  reason?: string;

  /**
   * When muted
   */
  mutedAt: Date;

  /**
   * Optional expiration
   */
  expiresAt?: Date;
}

/**
 * User preferences
 */
export interface UserPreferences {
  /**
   * VIP contacts
   */
  vips: VipContact[];

  /**
   * Custom keywords
   */
  keywords: CustomKeyword[];

  /**
   * Topic preferences
   */
  topics: TopicPreference[];

  /**
   * Muted senders
   */
  mutedSenders: MutedSender[];

  /**
   * Last modified timestamp
   */
  lastModified: Date;

  /**
   * Sync version (for conflict resolution)
   */
  version: number;
}

/**
 * Preferences store options
 */
export interface PreferencesStoreOptions {
  /**
   * Storage directory path
   */
  storagePath: string;

  /**
   * Encryption key (32 bytes hex string)
   */
  encryptionKey: string;

  /**
   * Whether to enable auto-sync
   * Default: false
   */
  autoSync?: boolean;

  /**
   * Sync callback (called when preferences should be synced)
   */
  onSync?: (preferences: UserPreferences) => Promise<void>;

  /**
   * Enable debug logging
   */
  debug?: boolean;
}

/**
 * Sync conflict resolution strategy
 */
export type ConflictResolution = 'local' | 'remote' | 'merge';

/**
 * Preferences Store
 *
 * Manages user preferences with encrypted local storage and sync capabilities.
 * Stores VIPs, keywords, topics, and muted senders for personalized intelligence.
 *
 * @example
 * ```typescript
 * import { PreferencesStore } from '@nexus-aec/intelligence';
 *
 * const store = new PreferencesStore({
 *   storagePath: './data/preferences',
 *   encryptionKey: process.env.ENCRYPTION_KEY!,
 *   autoSync: true,
 *   onSync: async (prefs) => {
 *     await api.syncPreferences(prefs);
 *   },
 * });
 *
 * // Initialize
 * await store.initialize();
 *
 * // Add VIP
 * await store.addVip({
 *   identifier: 'ceo@company.com',
 *   name: 'CEO',
 *   note: 'Executive leadership',
 * });
 *
 * // Add keyword
 * await store.addKeyword({
 *   pattern: 'critical',
 *   isRegex: false,
 *   weight: 0.9,
 *   category: 'urgency',
 * });
 *
 * // Check if VIP
 * const isVip = await store.isVip('ceo@company.com');
 * ```
 */
export class PreferencesStore {
  private storagePath: string;
  private encryptionKey: Buffer;
  private autoSync: boolean;
  private onSync?: (preferences: UserPreferences) => Promise<void>;
  private debug: boolean;
  private preferences: UserPreferences;
  private preferencesFile: string;

  constructor(options: PreferencesStoreOptions) {
    this.storagePath = options.storagePath;
    this.encryptionKey = Buffer.from(options.encryptionKey, 'hex');
    this.autoSync = options.autoSync ?? false;
    // With exactOptionalPropertyTypes, avoid assigning `undefined` to an optional field.
    if (options.onSync) {
      this.onSync = options.onSync;
    }
    this.debug = options.debug ?? false;
    this.preferencesFile = path.join(this.storagePath, 'preferences.enc');

    // Initialize with empty preferences
    this.preferences = this.createEmptyPreferences();

    if (this.encryptionKey.length !== 32) {
      throw new Error('Encryption key must be 32 bytes (64 hex characters)');
    }
  }

  /**
   * Initialize the store
   */
  async initialize(): Promise<void> {
    if (this.debug) {
      console.log('[PreferencesStore] Initializing...');
    }

    // Ensure storage directory exists
    await fs.mkdir(this.storagePath, { recursive: true });

    // Load existing preferences or create new
    try {
      await this.load();
    } catch (error) {
      if (this.debug) {
        console.log('[PreferencesStore] No existing preferences, starting fresh');
      }
      await this.save();
    }

    if (this.debug) {
      console.log('[PreferencesStore] Initialized successfully');
    }
  }

  /**
   * Add VIP contact
   */
  async addVip(contact: Omit<VipContact, 'addedAt'>): Promise<void> {
    // Check if already exists
    const existing = this.preferences.vips.find((v) => v.identifier === contact.identifier);
    if (existing) {
      throw new Error(`VIP already exists: ${contact.identifier}`);
    }

    this.preferences.vips.push({
      ...contact,
      addedAt: new Date(),
    });

    this.preferences.lastModified = new Date();
    this.preferences.version++;

    await this.save();

    if (this.debug) {
      console.log(`[PreferencesStore] Added VIP: ${contact.identifier}`);
    }
  }

  /**
   * Remove VIP contact
   */
  async removeVip(identifier: string): Promise<void> {
    const initialLength = this.preferences.vips.length;
    this.preferences.vips = this.preferences.vips.filter((v) => v.identifier !== identifier);

    if (this.preferences.vips.length === initialLength) {
      throw new Error(`VIP not found: ${identifier}`);
    }

    this.preferences.lastModified = new Date();
    this.preferences.version++;

    await this.save();

    if (this.debug) {
      console.log(`[PreferencesStore] Removed VIP: ${identifier}`);
    }
  }

  /**
   * Check if email or domain is VIP
   */
  async isVip(email: string): Promise<boolean> {
    const emailLower = email.toLowerCase();

    return this.preferences.vips.some((vip) => {
      const identifier = vip.identifier.toLowerCase();

      // Exact match
      if (identifier === emailLower) {
        return true;
      }

      // Domain match (if identifier starts with @)
      if (identifier.startsWith('@')) {
        const domain = identifier.substring(1);
        return emailLower.endsWith(`@${domain}`);
      }

      return false;
    });
  }

  /**
   * Get all VIPs
   */
  async getVips(): Promise<VipContact[]> {
    return [...this.preferences.vips];
  }

  /**
   * Add custom keyword
   */
  async addKeyword(keyword: Omit<CustomKeyword, 'addedAt'>): Promise<void> {
    // Check if pattern already exists
    const existing = this.preferences.keywords.find((k) => k.pattern === keyword.pattern);
    if (existing) {
      throw new Error(`Keyword already exists: ${keyword.pattern}`);
    }

    this.preferences.keywords.push({
      ...keyword,
      addedAt: new Date(),
    });

    this.preferences.lastModified = new Date();
    this.preferences.version++;

    await this.save();

    if (this.debug) {
      console.log(`[PreferencesStore] Added keyword: ${keyword.pattern}`);
    }
  }

  /**
   * Remove custom keyword
   */
  async removeKeyword(pattern: string): Promise<void> {
    const initialLength = this.preferences.keywords.length;
    this.preferences.keywords = this.preferences.keywords.filter((k) => k.pattern !== pattern);

    if (this.preferences.keywords.length === initialLength) {
      throw new Error(`Keyword not found: ${pattern}`);
    }

    this.preferences.lastModified = new Date();
    this.preferences.version++;

    await this.save();

    if (this.debug) {
      console.log(`[PreferencesStore] Removed keyword: ${pattern}`);
    }
  }

  /**
   * Get all custom keywords
   */
  async getKeywords(): Promise<CustomKeyword[]> {
    return [...this.preferences.keywords];
  }

  /**
   * Add or update topic preference
   */
  async setTopicPreference(topic: Omit<TopicPreference, 'addedAt'>): Promise<void> {
    const existing = this.preferences.topics.find((t) => t.topic === topic.topic);

    if (existing) {
      existing.priority = topic.priority;
      existing.muted = topic.muted;
    } else {
      this.preferences.topics.push({
        ...topic,
        addedAt: new Date(),
      });
    }

    this.preferences.lastModified = new Date();
    this.preferences.version++;

    await this.save();

    if (this.debug) {
      console.log(`[PreferencesStore] Set topic preference: ${topic.topic}`);
    }
  }

  /**
   * Remove topic preference
   */
  async removeTopicPreference(topic: string): Promise<void> {
    const initialLength = this.preferences.topics.length;
    this.preferences.topics = this.preferences.topics.filter((t) => t.topic !== topic);

    if (this.preferences.topics.length === initialLength) {
      throw new Error(`Topic preference not found: ${topic}`);
    }

    this.preferences.lastModified = new Date();
    this.preferences.version++;

    await this.save();

    if (this.debug) {
      console.log(`[PreferencesStore] Removed topic preference: ${topic}`);
    }
  }

  /**
   * Get all topic preferences
   */
  async getTopicPreferences(): Promise<TopicPreference[]> {
    return [...this.preferences.topics];
  }

  /**
   * Mute sender
   */
  async muteSender(sender: Omit<MutedSender, 'mutedAt'>): Promise<void> {
    // Check if already muted
    const existing = this.preferences.mutedSenders.find((m) => m.identifier === sender.identifier);
    if (existing) {
      throw new Error(`Sender already muted: ${sender.identifier}`);
    }

    this.preferences.mutedSenders.push({
      ...sender,
      mutedAt: new Date(),
    });

    this.preferences.lastModified = new Date();
    this.preferences.version++;

    await this.save();

    if (this.debug) {
      console.log(`[PreferencesStore] Muted sender: ${sender.identifier}`);
    }
  }

  /**
   * Unmute sender
   */
  async unmuteSender(identifier: string): Promise<void> {
    const initialLength = this.preferences.mutedSenders.length;
    this.preferences.mutedSenders = this.preferences.mutedSenders.filter(
      (m) => m.identifier !== identifier
    );

    if (this.preferences.mutedSenders.length === initialLength) {
      throw new Error(`Muted sender not found: ${identifier}`);
    }

    this.preferences.lastModified = new Date();
    this.preferences.version++;

    await this.save();

    if (this.debug) {
      console.log(`[PreferencesStore] Unmuted sender: ${identifier}`);
    }
  }

  /**
   * Check if sender is muted
   */
  async isMuted(email: string): Promise<boolean> {
    const emailLower = email.toLowerCase();
    const now = new Date();

    return this.preferences.mutedSenders.some((muted) => {
      // Check expiration
      if (muted.expiresAt && muted.expiresAt < now) {
        return false;
      }

      const identifier = muted.identifier.toLowerCase();

      // Exact match
      if (identifier === emailLower) {
        return true;
      }

      // Domain match (if identifier starts with @)
      if (identifier.startsWith('@')) {
        const domain = identifier.substring(1);
        return emailLower.endsWith(`@${domain}`);
      }

      return false;
    });
  }

  /**
   * Get all muted senders (excluding expired)
   */
  async getMutedSenders(): Promise<MutedSender[]> {
    const now = new Date();
    return this.preferences.mutedSenders.filter(
      (m) => !m.expiresAt || m.expiresAt >= now
    );
  }

  /**
   * Get all preferences
   */
  async getPreferences(): Promise<UserPreferences> {
    return {
      ...this.preferences,
      vips: [...this.preferences.vips],
      keywords: [...this.preferences.keywords],
      topics: [...this.preferences.topics],
      mutedSenders: [...this.preferences.mutedSenders],
    };
  }

  /**
   * Import preferences (with conflict resolution)
   */
  async importPreferences(
    remotePreferences: UserPreferences,
    strategy: ConflictResolution = 'merge'
  ): Promise<void> {
    if (this.debug) {
      console.log(
        `[PreferencesStore] Importing preferences (strategy: ${strategy}, remote version: ${remotePreferences.version}, local version: ${this.preferences.version})`
      );
    }

    if (strategy === 'remote') {
      this.preferences = this.deserializePreferences(remotePreferences);
    } else if (strategy === 'local') {
      // Keep local, do nothing
    } else if (strategy === 'merge') {
      this.preferences = this.mergePreferences(this.preferences, remotePreferences);
    }

    await this.save();

    if (this.debug) {
      console.log('[PreferencesStore] Import complete');
    }
  }

  /**
   * Export preferences
   */
  async exportPreferences(): Promise<UserPreferences> {
    return this.getPreferences();
  }

  /**
   * Clear all preferences
   */
  async clear(): Promise<void> {
    this.preferences = this.createEmptyPreferences();
    await this.save();

    if (this.debug) {
      console.log('[PreferencesStore] Cleared all preferences');
    }
  }

  /**
   * Save preferences to encrypted file
   */
  private async save(): Promise<void> {
    const serialized = this.serializePreferences(this.preferences);
    const encrypted = this.encrypt(serialized);
    await fs.writeFile(this.preferencesFile, encrypted);

    if (this.autoSync && this.onSync) {
      try {
        await this.onSync(this.preferences);
      } catch (error) {
        if (this.debug) {
          console.error('[PreferencesStore] Sync failed:', error);
        }
      }
    }
  }

  /**
   * Load preferences from encrypted file
   */
  private async load(): Promise<void> {
    const encrypted = await fs.readFile(this.preferencesFile);
    const decrypted = this.decrypt(encrypted);
    const parsed = JSON.parse(decrypted);
    this.preferences = this.deserializePreferences(parsed);
  }

  /**
   * Encrypt data
   */
  private encrypt(data: string): Buffer {
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-cbc', this.encryptionKey, iv);

    const encrypted = Buffer.concat([cipher.update(data, 'utf8'), cipher.final()]);

    // Prepend IV to encrypted data
    return Buffer.concat([iv, encrypted]);
  }

  /**
   * Decrypt data
   */
  private decrypt(data: Buffer): string {
    const iv = data.subarray(0, 16);
    const encrypted = data.subarray(16);

    const decipher = crypto.createDecipheriv('aes-256-cbc', this.encryptionKey, iv);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);

    return decrypted.toString('utf8');
  }

  /**
   * Serialize preferences to JSON string
   */
  private serializePreferences(prefs: UserPreferences): string {
    return JSON.stringify(prefs);
  }

  /**
   * Deserialize preferences from parsed JSON
   */
  private deserializePreferences(data: any): UserPreferences {
    return {
      vips: (data.vips || []).map((v: any) => ({
        ...v,
        addedAt: new Date(v.addedAt),
      })),
      keywords: (data.keywords || []).map((k: any) => ({
        ...k,
        addedAt: new Date(k.addedAt),
      })),
      topics: (data.topics || []).map((t: any) => ({
        ...t,
        addedAt: new Date(t.addedAt),
      })),
      mutedSenders: (data.mutedSenders || []).map((m: any) => ({
        ...m,
        mutedAt: new Date(m.mutedAt),
        ...(m.expiresAt ? { expiresAt: new Date(m.expiresAt) } : {}),
      })),
      lastModified: new Date(data.lastModified),
      version: data.version || 0,
    };
  }

  /**
   * Merge local and remote preferences
   */
  private mergePreferences(local: UserPreferences, remote: UserPreferences): UserPreferences {
    // Use remote if it has a higher version
    if (remote.version > local.version) {
      return this.deserializePreferences(remote);
    }

    // Otherwise, merge by combining unique items
    const merged: UserPreferences = {
      vips: this.mergeArray(local.vips, remote.vips, 'identifier'),
      keywords: this.mergeArray(local.keywords, remote.keywords, 'pattern'),
      topics: this.mergeArray(local.topics, remote.topics, 'topic'),
      mutedSenders: this.mergeArray(local.mutedSenders, remote.mutedSenders, 'identifier'),
      lastModified: new Date(),
      version: Math.max(local.version, remote.version) + 1,
    };

    return merged;
  }

  /**
   * Merge two arrays by unique key
   */
  private mergeArray<T>(local: T[], remote: T[], key: keyof T): T[] {
    const map = new Map<any, T>();

    // Add local items
    for (const item of local) {
      map.set(item[key], item);
    }

    // Add remote items (overwrite if exists)
    for (const item of remote) {
      if (!map.has(item[key])) {
        map.set(item[key], item);
      }
    }

    return Array.from(map.values());
  }

  /**
   * Create empty preferences
   */
  private createEmptyPreferences(): UserPreferences {
    return {
      vips: [],
      keywords: [],
      topics: [],
      mutedSenders: [],
      lastModified: new Date(),
      version: 0,
    };
  }

  /**
   * Generate encryption key (utility)
   */
  static generateEncryptionKey(): string {
    return crypto.randomBytes(32).toString('hex');
  }
}
