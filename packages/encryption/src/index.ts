/**
 * @nexus-aec/encryption
 *
 * AES-256 encryption utilities and key derivation functions.
 * Used for encrypting sensitive data at rest (tokens, preferences, audit logs).
 */

import { randomBytes, createCipheriv, createDecipheriv, pbkdf2 } from 'crypto';
import { promisify } from 'util';

const pbkdf2Async = promisify(pbkdf2);

// Constants
const DEFAULT_ALGORITHM = 'aes-256-gcm';
const DEFAULT_ENCODING = 'base64';
const DEFAULT_KEY_LENGTH = 32; // 256 bits for AES-256
const DEFAULT_IV_LENGTH = 16; // 128 bits
const DEFAULT_SALT_LENGTH = 32; // 256 bits
const DEFAULT_AUTH_TAG_LENGTH = 16; // 128 bits for GCM
const DEFAULT_PBKDF2_ITERATIONS = 100000;
const PBKDF2_DIGEST = 'sha256';

// =============================================================================
// Types
// =============================================================================

export interface EncryptionOptions {
  /** Algorithm to use (default: aes-256-gcm) */
  algorithm?: 'aes-256-gcm' | 'aes-256-cbc';
  /** Encoding for output (default: base64) */
  encoding?: BufferEncoding;
}

export interface EncryptedData {
  /** The encrypted ciphertext */
  ciphertext: string;
  /** Initialization vector */
  iv: string;
  /** Authentication tag (for GCM mode) */
  authTag?: string;
  /** Algorithm used */
  algorithm: string;
  /** Encoding used */
  encoding: BufferEncoding;
}

export interface KeyDerivationOptions {
  /** Salt for key derivation (will be generated if not provided) */
  salt?: string;
  /** Number of iterations (default: 100000) */
  iterations?: number;
  /** Key length in bytes (default: 32 for AES-256) */
  keyLength?: number;
  /** Encoding of the salt if provided as string (default: base64) */
  saltEncoding?: BufferEncoding;
}

export interface DerivedKey {
  /** The derived key */
  key: Buffer;
  /** Salt used for derivation (base64 encoded) */
  salt: string;
  /** Number of iterations used */
  iterations: number;
}

// =============================================================================
// Key Generation
// =============================================================================

/**
 * Generate a cryptographically secure random key
 * @param length - Key length in bytes (default: 32 for AES-256)
 * @returns Random key as Buffer
 */
export function generateKey(length: number = DEFAULT_KEY_LENGTH): Buffer {
  if (length <= 0) {
    throw new Error('Key length must be a positive number');
  }
  return randomBytes(length);
}

/**
 * Generate a cryptographically secure random IV (initialization vector)
 * @param length - IV length in bytes (default: 16)
 * @returns Random IV as Buffer
 */
export function generateIV(length: number = DEFAULT_IV_LENGTH): Buffer {
  if (length <= 0) {
    throw new Error('IV length must be a positive number');
  }
  return randomBytes(length);
}

/**
 * Generate a cryptographically secure random salt
 * @param length - Salt length in bytes (default: 32)
 * @returns Random salt as Buffer
 */
export function generateSalt(length: number = DEFAULT_SALT_LENGTH): Buffer {
  if (length <= 0) {
    throw new Error('Salt length must be a positive number');
  }
  return randomBytes(length);
}

// =============================================================================
// Key Derivation
// =============================================================================

/**
 * Derive a key from a password using PBKDF2
 * @param password - Password to derive key from
 * @param options - Key derivation options
 * @returns Derived key, salt, and iterations used
 */
export async function deriveKey(
  password: string,
  options: KeyDerivationOptions = {}
): Promise<DerivedKey> {
  if (!password) {
    throw new Error('Password is required for key derivation');
  }

  const iterations = options.iterations ?? DEFAULT_PBKDF2_ITERATIONS;
  const keyLength = options.keyLength ?? DEFAULT_KEY_LENGTH;
  const saltEncoding = options.saltEncoding ?? 'base64';

  if (iterations < 10000) {
    throw new Error('Iterations must be at least 10000 for security');
  }

  if (keyLength < 16) {
    throw new Error('Key length must be at least 16 bytes');
  }

  // Use provided salt or generate a new one
  let saltBuffer: Buffer;
  if (options.salt) {
    saltBuffer = Buffer.from(options.salt, saltEncoding);
  } else {
    saltBuffer = generateSalt();
  }

  const key = await pbkdf2Async(password, saltBuffer, iterations, keyLength, PBKDF2_DIGEST);

  return {
    key,
    salt: saltBuffer.toString('base64'),
    iterations,
  };
}

// =============================================================================
// Encryption
// =============================================================================

/**
 * Encrypt data using AES-256
 * @param plaintext - Data to encrypt
 * @param key - Encryption key (32 bytes for AES-256)
 * @param options - Encryption options
 * @returns Encrypted data with IV and auth tag
 */
export async function encrypt(
  plaintext: string,
  key: Buffer,
  options: EncryptionOptions = {}
): Promise<EncryptedData> {
  if (!plaintext) {
    throw new Error('Plaintext is required for encryption');
  }

  if (!key || key.length !== DEFAULT_KEY_LENGTH) {
    throw new Error(`Encryption key must be ${DEFAULT_KEY_LENGTH} bytes (${DEFAULT_KEY_LENGTH * 8} bits)`);
  }

  const algorithm = options.algorithm ?? DEFAULT_ALGORITHM;
  const encoding = options.encoding ?? DEFAULT_ENCODING;

  const iv = generateIV();

  if (algorithm === 'aes-256-gcm') {
    const cipher = createCipheriv(algorithm, key, iv, {
      authTagLength: DEFAULT_AUTH_TAG_LENGTH,
    });

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    const authTag = cipher.getAuthTag();

    return {
      ciphertext: encrypted.toString(encoding),
      iv: iv.toString(encoding),
      authTag: authTag.toString(encoding),
      algorithm,
      encoding,
    };
  } else if (algorithm === 'aes-256-cbc') {
    const cipher = createCipheriv(algorithm, key, iv);

    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);

    return {
      ciphertext: encrypted.toString(encoding),
      iv: iv.toString(encoding),
      algorithm,
      encoding,
    };
  }

  throw new Error(`Unsupported algorithm: ${algorithm}`);
}

// =============================================================================
// Decryption
// =============================================================================

/**
 * Decrypt data encrypted with AES-256
 * @param encryptedData - Data to decrypt
 * @param key - Decryption key
 * @returns Decrypted plaintext
 */
export async function decrypt(encryptedData: EncryptedData, key: Buffer): Promise<string> {
  if (!encryptedData) {
    throw new Error('Encrypted data is required for decryption');
  }

  if (!key || key.length !== DEFAULT_KEY_LENGTH) {
    throw new Error(`Decryption key must be ${DEFAULT_KEY_LENGTH} bytes (${DEFAULT_KEY_LENGTH * 8} bits)`);
  }

  const { ciphertext, iv, authTag, algorithm, encoding } = encryptedData;

  if (!ciphertext || !iv || !algorithm) {
    throw new Error('Invalid encrypted data: missing required fields');
  }

  const ciphertextBuffer = Buffer.from(ciphertext, encoding);
  const ivBuffer = Buffer.from(iv, encoding);

  if (algorithm === 'aes-256-gcm') {
    if (!authTag) {
      throw new Error('Authentication tag is required for GCM decryption');
    }

    const authTagBuffer = Buffer.from(authTag, encoding);

    const decipher = createDecipheriv(algorithm, key, ivBuffer, {
      authTagLength: DEFAULT_AUTH_TAG_LENGTH,
    });

    decipher.setAuthTag(authTagBuffer);

    try {
      const decrypted = Buffer.concat([decipher.update(ciphertextBuffer), decipher.final()]);
      return decrypted.toString('utf8');
    } catch (error) {
      throw new Error('Decryption failed: invalid key or corrupted data');
    }
  } else if (algorithm === 'aes-256-cbc') {
    const decipher = createDecipheriv(algorithm, key, ivBuffer);

    try {
      const decrypted = Buffer.concat([decipher.update(ciphertextBuffer), decipher.final()]);
      return decrypted.toString('utf8');
    } catch (error) {
      throw new Error('Decryption failed: invalid key or corrupted data');
    }
  }

  throw new Error(`Unsupported algorithm: ${algorithm}`);
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Encrypt data with a password (combines key derivation + encryption)
 * Convenient wrapper for encrypting data with just a password
 * @param plaintext - Data to encrypt
 * @param password - Password to derive key from
 * @returns Encrypted data with salt for key derivation
 */
export async function encryptWithPassword(
  plaintext: string,
  password: string
): Promise<EncryptedData & { salt: string; iterations: number }> {
  const { key, salt, iterations } = await deriveKey(password);
  const encrypted = await encrypt(plaintext, key);

  return {
    ...encrypted,
    salt,
    iterations,
  };
}

/**
 * Decrypt data with a password (combines key derivation + decryption)
 * Convenient wrapper for decrypting data with just a password
 * @param encryptedData - Data to decrypt (must include salt and iterations)
 * @param password - Password to derive key from
 * @returns Decrypted plaintext
 */
export async function decryptWithPassword(
  encryptedData: EncryptedData & { salt: string; iterations: number },
  password: string
): Promise<string> {
  const { salt, iterations, ...encrypted } = encryptedData;

  const { key } = await deriveKey(password, { salt, iterations });

  return decrypt(encrypted, key);
}

/**
 * Securely compare two buffers in constant time
 * Prevents timing attacks when comparing secrets
 * @param a - First buffer
 * @param b - Second buffer
 * @returns True if buffers are equal
 */
export function secureCompare(a: Buffer, b: Buffer): boolean {
  if (a.length !== b.length) {
    return false;
  }

  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i]! ^ b[i]!;
  }

  return result === 0;
}
