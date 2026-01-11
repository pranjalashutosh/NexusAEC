/**
 * @nexus-aec/secure-storage
 *
 * Platform-agnostic secure storage abstraction.
 * - iOS/macOS: Keychain (via native bridge)
 * - Android: EncryptedSharedPreferences (via native bridge)
 * - Windows: Credential Manager (via native bridge)
 * - Linux: libsecret (via native bridge)
 * - Node.js/Web: Encrypted in-memory or file-based storage
 */

import { encrypt, decrypt, deriveKey, generateKey } from '@nexus-aec/encryption';

// =============================================================================
// Types
// =============================================================================

export type StoragePlatform = 'ios' | 'macos' | 'android' | 'windows' | 'linux' | 'web' | 'node';

export interface SecureStorageOptions {
  /** Service/app identifier for the keychain */
  service?: string;
  /** Access group for iOS keychain sharing */
  accessGroup?: string;
  /** Whether to sync across devices (iCloud Keychain, etc.) */
  synchronizable?: boolean;
  /** Encryption key for in-memory/file storage (will be generated if not provided) */
  encryptionKey?: Buffer;
  /** Password for key derivation (alternative to encryptionKey) */
  password?: string;
}

export interface StoredItem {
  key: string;
  value: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface for platform-specific secure storage implementations
 */
export interface ISecureStorage {
  /**
   * Store a value securely
   * @param key - Unique key for the item
   * @param value - Value to store (will be encrypted)
   */
  setItem(key: string, value: string): Promise<void>;

  /**
   * Retrieve a securely stored value
   * @param key - Key of the item to retrieve
   * @returns The stored value, or null if not found
   */
  getItem(key: string): Promise<string | null>;

  /**
   * Remove a securely stored item
   * @param key - Key of the item to remove
   */
  removeItem(key: string): Promise<void>;

  /**
   * Check if a key exists in secure storage
   * @param key - Key to check
   */
  hasItem(key: string): Promise<boolean>;

  /**
   * Get all keys in secure storage
   */
  getAllKeys(): Promise<string[]>;

  /**
   * Clear all items from secure storage
   */
  clear(): Promise<void>;
}

// =============================================================================
// Platform Detection
// =============================================================================

/**
 * Detect the current platform
 * @returns The current platform identifier
 */
export function detectPlatform(): StoragePlatform {
  // Check for React Native
  if (typeof navigator !== 'undefined' && navigator.product === 'ReactNative') {
    // In React Native, we need to check the OS
    // This will be refined when native modules are available
    if (typeof global !== 'undefined') {
      const g = global as Record<string, unknown>;
      if (g.__ANDROID__) {
        return 'android';
      }
      if (g.__IOS__) {
        return 'ios';
      }
    }
    return 'android'; // Default to android for React Native
  }

  // Check for browser
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    return 'web';
  }

  // Check for Node.js
  if (typeof process !== 'undefined' && process.versions?.node) {
    const platform = process.platform;
    switch (platform) {
      case 'darwin':
        return 'macos';
      case 'win32':
        return 'windows';
      case 'linux':
        return 'linux';
      default:
        return 'node';
    }
  }

  return 'node';
}

/**
 * Check if secure storage is available on the current platform
 * @returns True if secure storage is supported
 */
export function isSecureStorageAvailable(): boolean {
  const platform = detectPlatform();

  // For Node.js environments, we always have the encrypted memory storage
  if (platform === 'node' || platform === 'macos' || platform === 'windows' || platform === 'linux') {
    return true;
  }

  // For React Native, check if native module is available
  if (platform === 'ios' || platform === 'android') {
    // Native module availability would be checked here
    // For now, return true as we'll use encrypted storage fallback
    return true;
  }

  // For web, we can use localStorage with encryption
  if (platform === 'web') {
    return typeof localStorage !== 'undefined';
  }

  return false;
}

// =============================================================================
// In-Memory Secure Storage (for Node.js and testing)
// =============================================================================

interface EncryptedStorageItem {
  ciphertext: string;
  iv: string;
  authTag?: string;
  algorithm: string;
  encoding: BufferEncoding;
  createdAt: string;
  updatedAt: string;
}

/**
 * Encrypted in-memory storage implementation
 * Uses AES-256-GCM encryption for all stored values
 */
export class EncryptedMemoryStorage implements ISecureStorage {
  private storage: Map<string, EncryptedStorageItem> = new Map();
  private encryptionKey: Buffer;
  private readonly service: string;

  constructor(options: SecureStorageOptions = {}) {
    this.service = options.service ?? 'nexus-aec';

    if (options.encryptionKey) {
      if (options.encryptionKey.length !== 32) {
        throw new Error('Encryption key must be 32 bytes');
      }
      this.encryptionKey = options.encryptionKey;
    } else {
      // Generate a random key for this session
      // In production, this should be derived from a secure source
      this.encryptionKey = generateKey();
    }
  }

  /**
   * Initialize with a password (async key derivation)
   */
  static async createWithPassword(
    password: string,
    options: Omit<SecureStorageOptions, 'encryptionKey' | 'password'> = {}
  ): Promise<EncryptedMemoryStorage> {
    const { key } = await deriveKey(password);
    return new EncryptedMemoryStorage({ ...options, encryptionKey: key });
  }

  private getFullKey(key: string): string {
    return `${this.service}:${key}`;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (!key) {
      throw new Error('Key is required');
    }
    if (value === undefined || value === null) {
      throw new Error('Value is required');
    }

    const fullKey = this.getFullKey(key);
    const now = new Date().toISOString();

    const encrypted = await encrypt(value, this.encryptionKey);

    const item: EncryptedStorageItem = {
      ciphertext: encrypted.ciphertext,
      iv: encrypted.iv,
      algorithm: encrypted.algorithm,
      encoding: encrypted.encoding,
      createdAt: this.storage.get(fullKey)?.createdAt ?? now,
      updatedAt: now,
    };

    if (encrypted.authTag) {
      item.authTag = encrypted.authTag;
    }

    this.storage.set(fullKey, item);
  }

  async getItem(key: string): Promise<string | null> {
    if (!key) {
      throw new Error('Key is required');
    }

    const fullKey = this.getFullKey(key);
    const item = this.storage.get(fullKey);

    if (!item) {
      return null;
    }

    try {
      const encryptedData: {
        ciphertext: string;
        iv: string;
        authTag?: string;
        algorithm: string;
        encoding: BufferEncoding;
      } = {
        ciphertext: item.ciphertext,
        iv: item.iv,
        algorithm: item.algorithm,
        encoding: item.encoding,
      };

      if (item.authTag) {
        encryptedData.authTag = item.authTag;
      }

      const decrypted = await decrypt(encryptedData, this.encryptionKey);
      return decrypted;
    } catch {
      // If decryption fails, the data is corrupted or key changed
      return null;
    }
  }

  async removeItem(key: string): Promise<void> {
    if (!key) {
      throw new Error('Key is required');
    }

    const fullKey = this.getFullKey(key);
    this.storage.delete(fullKey);
  }

  async hasItem(key: string): Promise<boolean> {
    if (!key) {
      throw new Error('Key is required');
    }

    const fullKey = this.getFullKey(key);
    return this.storage.has(fullKey);
  }

  async getAllKeys(): Promise<string[]> {
    const prefix = `${this.service}:`;
    const keys: string[] = [];

    for (const fullKey of this.storage.keys()) {
      if (fullKey.startsWith(prefix)) {
        keys.push(fullKey.slice(prefix.length));
      }
    }

    return keys;
  }

  async clear(): Promise<void> {
    const prefix = `${this.service}:`;
    const keysToDelete: string[] = [];

    for (const fullKey of this.storage.keys()) {
      if (fullKey.startsWith(prefix)) {
        keysToDelete.push(fullKey);
      }
    }

    for (const key of keysToDelete) {
      this.storage.delete(key);
    }
  }

  /**
   * Get storage statistics (for debugging)
   */
  getStats(): { itemCount: number; service: string } {
    return {
      itemCount: this.storage.size,
      service: this.service,
    };
  }
}

// =============================================================================
// Web Storage (localStorage with encryption)
// =============================================================================

/**
 * Web storage implementation using localStorage with encryption
 * Only available in browser environments
 */
export class EncryptedWebStorage implements ISecureStorage {
  private encryptionKey: Buffer;
  private readonly service: string;
  private readonly storagePrefix: string;

  constructor(options: SecureStorageOptions = {}) {
    if (typeof localStorage === 'undefined') {
      throw new Error('localStorage is not available');
    }

    this.service = options.service ?? 'nexus-aec';
    this.storagePrefix = `__secure_${this.service}_`;

    if (options.encryptionKey) {
      if (options.encryptionKey.length !== 32) {
        throw new Error('Encryption key must be 32 bytes');
      }
      this.encryptionKey = options.encryptionKey;
    } else {
      this.encryptionKey = generateKey();
    }
  }

  static async createWithPassword(
    password: string,
    options: Omit<SecureStorageOptions, 'encryptionKey' | 'password'> = {}
  ): Promise<EncryptedWebStorage> {
    const { key } = await deriveKey(password);
    return new EncryptedWebStorage({ ...options, encryptionKey: key });
  }

  private getFullKey(key: string): string {
    return `${this.storagePrefix}${key}`;
  }

  async setItem(key: string, value: string): Promise<void> {
    if (!key) {
      throw new Error('Key is required');
    }

    const fullKey = this.getFullKey(key);
    const encrypted = await encrypt(value, this.encryptionKey);

    const item = {
      ...encrypted,
      createdAt: localStorage.getItem(fullKey)
        ? JSON.parse(localStorage.getItem(fullKey)!).createdAt
        : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    localStorage.setItem(fullKey, JSON.stringify(item));
  }

  async getItem(key: string): Promise<string | null> {
    if (!key) {
      throw new Error('Key is required');
    }

    const fullKey = this.getFullKey(key);
    const stored = localStorage.getItem(fullKey);

    if (!stored) {
      return null;
    }

    try {
      const item = JSON.parse(stored);
      return await decrypt(item, this.encryptionKey);
    } catch {
      return null;
    }
  }

  async removeItem(key: string): Promise<void> {
    const fullKey = this.getFullKey(key);
    localStorage.removeItem(fullKey);
  }

  async hasItem(key: string): Promise<boolean> {
    const fullKey = this.getFullKey(key);
    return localStorage.getItem(fullKey) !== null;
  }

  async getAllKeys(): Promise<string[]> {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const fullKey = localStorage.key(i);
      if (fullKey?.startsWith(this.storagePrefix)) {
        keys.push(fullKey.slice(this.storagePrefix.length));
      }
    }
    return keys;
  }

  async clear(): Promise<void> {
    const keys = await this.getAllKeys();
    for (const key of keys) {
      await this.removeItem(key);
    }
  }
}

// =============================================================================
// Native Storage Placeholder (for React Native)
// =============================================================================

/**
 * Placeholder for native secure storage implementations
 * In React Native, this will be replaced with native module bindings
 */
export class NativeSecureStorage implements ISecureStorage {
  private readonly platform: StoragePlatform;
  private readonly fallback: EncryptedMemoryStorage;

  constructor(options: SecureStorageOptions = {}) {
    this.platform = detectPlatform();
    // Use encrypted memory storage as fallback
    this.fallback = new EncryptedMemoryStorage(options);

    // In a real implementation, we would initialize native modules here
    // For now, we'll use the fallback
    console.warn(
      `[SecureStorage] Native storage for ${this.platform} not yet implemented. Using encrypted memory fallback.`
    );
  }

  async setItem(key: string, value: string): Promise<void> {
    return this.fallback.setItem(key, value);
  }

  async getItem(key: string): Promise<string | null> {
    return this.fallback.getItem(key);
  }

  async removeItem(key: string): Promise<void> {
    return this.fallback.removeItem(key);
  }

  async hasItem(key: string): Promise<boolean> {
    return this.fallback.hasItem(key);
  }

  async getAllKeys(): Promise<string[]> {
    return this.fallback.getAllKeys();
  }

  async clear(): Promise<void> {
    return this.fallback.clear();
  }
}

// =============================================================================
// Factory Function
// =============================================================================

/**
 * Create a secure storage instance for the current platform
 * @param options - Storage configuration options
 * @returns Platform-appropriate secure storage implementation
 */
export function createSecureStorage(options: SecureStorageOptions = {}): ISecureStorage {
  const platform = detectPlatform();

  switch (platform) {
    case 'web':
      if (typeof localStorage !== 'undefined') {
        return new EncryptedWebStorage(options);
      }
      // Fall through to memory storage if localStorage unavailable
      return new EncryptedMemoryStorage(options);

    case 'ios':
    case 'android':
      // Return native storage (with fallback)
      return new NativeSecureStorage(options);

    case 'macos':
    case 'windows':
    case 'linux':
    case 'node':
    default:
      // Use encrypted memory storage for Node.js/desktop
      return new EncryptedMemoryStorage(options);
  }
}

/**
 * Create a secure storage instance with password-based key derivation
 * @param password - Password to derive encryption key from
 * @param options - Storage configuration options
 * @returns Platform-appropriate secure storage implementation
 */
export async function createSecureStorageWithPassword(
  password: string,
  options: Omit<SecureStorageOptions, 'encryptionKey' | 'password'> = {}
): Promise<ISecureStorage> {
  const platform = detectPlatform();

  switch (platform) {
    case 'web':
      if (typeof localStorage !== 'undefined') {
        return EncryptedWebStorage.createWithPassword(password, options);
      }
      return EncryptedMemoryStorage.createWithPassword(password, options);

    case 'ios':
    case 'android':
      // Native storage doesn't need password - it uses platform keychain
      // But for fallback, we'll derive a key
      const { key } = await deriveKey(password);
      return new NativeSecureStorage({ ...options, encryptionKey: key });

    default:
      return EncryptedMemoryStorage.createWithPassword(password, options);
  }
}

// =============================================================================
// Re-exports
// =============================================================================

// Re-export types from shared-types that are relevant
export type { UserPreferences } from '@nexus-aec/shared-types';
