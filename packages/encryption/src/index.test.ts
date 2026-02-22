/**
 * Unit tests for @nexus-aec/encryption
 */

import {
  generateKey,
  generateIV,
  generateSalt,
  deriveKey,
  encrypt,
  decrypt,
  encryptWithPassword,
  decryptWithPassword,
  secureCompare,
} from './index';

describe('@nexus-aec/encryption', () => {
  describe('generateKey', () => {
    it('should generate a 32-byte key by default', () => {
      const key = generateKey();
      expect(key).toBeInstanceOf(Buffer);
      expect(key.length).toBe(32);
    });

    it('should generate a key of specified length', () => {
      const key = generateKey(16);
      expect(key.length).toBe(16);
    });

    it('should generate unique keys', () => {
      const key1 = generateKey();
      const key2 = generateKey();
      expect(key1.equals(key2)).toBe(false);
    });

    it('should throw for invalid length', () => {
      expect(() => generateKey(0)).toThrow('Key length must be a positive number');
      expect(() => generateKey(-1)).toThrow('Key length must be a positive number');
    });
  });

  describe('generateIV', () => {
    it('should generate a 16-byte IV by default', () => {
      const iv = generateIV();
      expect(iv).toBeInstanceOf(Buffer);
      expect(iv.length).toBe(16);
    });

    it('should generate an IV of specified length', () => {
      const iv = generateIV(12);
      expect(iv.length).toBe(12);
    });

    it('should generate unique IVs', () => {
      const iv1 = generateIV();
      const iv2 = generateIV();
      expect(iv1.equals(iv2)).toBe(false);
    });
  });

  describe('generateSalt', () => {
    it('should generate a 32-byte salt by default', () => {
      const salt = generateSalt();
      expect(salt).toBeInstanceOf(Buffer);
      expect(salt.length).toBe(32);
    });

    it('should generate unique salts', () => {
      const salt1 = generateSalt();
      const salt2 = generateSalt();
      expect(salt1.equals(salt2)).toBe(false);
    });
  });

  describe('deriveKey', () => {
    it('should derive a key from password', async () => {
      const result = await deriveKey('mySecretPassword');

      expect(result.key).toBeInstanceOf(Buffer);
      expect(result.key.length).toBe(32);
      expect(result.salt).toBeTruthy();
      expect(result.iterations).toBe(100000);
    });

    it('should derive the same key with the same password and salt', async () => {
      const result1 = await deriveKey('myPassword');
      const result2 = await deriveKey('myPassword', { salt: result1.salt });

      expect(result1.key.equals(result2.key)).toBe(true);
    });

    it('should derive different keys with different passwords', async () => {
      const result1 = await deriveKey('password1');
      const result2 = await deriveKey('password2', { salt: result1.salt });

      expect(result1.key.equals(result2.key)).toBe(false);
    });

    it('should derive different keys with different salts', async () => {
      const result1 = await deriveKey('samePassword');
      const result2 = await deriveKey('samePassword');

      // Different salts should produce different keys
      expect(result1.key.equals(result2.key)).toBe(false);
    });

    it('should throw for empty password', async () => {
      await expect(deriveKey('')).rejects.toThrow('Password is required');
    });

    it('should throw for low iteration count', async () => {
      await expect(deriveKey('password', { iterations: 1000 })).rejects.toThrow(
        'Iterations must be at least 10000'
      );
    });

    it('should use custom iterations when specified', async () => {
      const result = await deriveKey('password', { iterations: 50000 });
      expect(result.iterations).toBe(50000);
    });
  });

  describe('encrypt/decrypt with AES-256-GCM', () => {
    const key = generateKey();
    const plaintext = 'Hello, World! This is a secret message.';

    it('should encrypt and decrypt data correctly', async () => {
      const encrypted = await encrypt(plaintext, key);
      const decrypted = await decrypt(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });

    it('should include all required fields in encrypted data', async () => {
      const encrypted = await encrypt(plaintext, key);

      expect(encrypted.ciphertext).toBeTruthy();
      expect(encrypted.iv).toBeTruthy();
      expect(encrypted.authTag).toBeTruthy();
      expect(encrypted.algorithm).toBe('aes-256-gcm');
      expect(encrypted.encoding).toBe('base64');
    });

    it('should produce different ciphertext for same plaintext (due to random IV)', async () => {
      const encrypted1 = await encrypt(plaintext, key);
      const encrypted2 = await encrypt(plaintext, key);

      expect(encrypted1.ciphertext).not.toBe(encrypted2.ciphertext);
      expect(encrypted1.iv).not.toBe(encrypted2.iv);
    });

    it('should fail decryption with wrong key', async () => {
      const encrypted = await encrypt(plaintext, key);
      const wrongKey = generateKey();

      await expect(decrypt(encrypted, wrongKey)).rejects.toThrow('Decryption failed');
    });

    it('should fail decryption with tampered ciphertext', async () => {
      const encrypted = await encrypt(plaintext, key);
      encrypted.ciphertext = 'tampered' + encrypted.ciphertext.slice(8);

      await expect(decrypt(encrypted, key)).rejects.toThrow('Decryption failed');
    });

    it('should fail decryption with missing auth tag', async () => {
      const encrypted = await encrypt(plaintext, key);
      delete encrypted.authTag;

      await expect(decrypt(encrypted, key)).rejects.toThrow('Authentication tag is required');
    });

    it('should handle empty strings', async () => {
      await expect(encrypt('', key)).rejects.toThrow('Plaintext is required');
    });

    it('should handle unicode text', async () => {
      const unicodeText = '你好世界 🌍 مرحبا';
      const encrypted = await encrypt(unicodeText, key);
      const decrypted = await decrypt(encrypted, key);

      expect(decrypted).toBe(unicodeText);
    });

    it('should handle large text', async () => {
      const largeText = 'x'.repeat(100000);
      const encrypted = await encrypt(largeText, key);
      const decrypted = await decrypt(encrypted, key);

      expect(decrypted).toBe(largeText);
    });
  });

  describe('encrypt/decrypt with AES-256-CBC', () => {
    const key = generateKey();
    const plaintext = 'Hello, World! This is a secret message.';

    it('should encrypt and decrypt data correctly', async () => {
      const encrypted = await encrypt(plaintext, key, { algorithm: 'aes-256-cbc' });
      const decrypted = await decrypt(encrypted, key);

      expect(decrypted).toBe(plaintext);
    });

    it('should not include auth tag for CBC mode', async () => {
      const encrypted = await encrypt(plaintext, key, { algorithm: 'aes-256-cbc' });

      expect(encrypted.authTag).toBeUndefined();
      expect(encrypted.algorithm).toBe('aes-256-cbc');
    });
  });

  describe('encryptWithPassword/decryptWithPassword', () => {
    const password = 'mySecurePassword123!';
    const plaintext = 'Secret data to protect';

    it('should encrypt and decrypt with password', async () => {
      const encrypted = await encryptWithPassword(plaintext, password);
      const decrypted = await decryptWithPassword(encrypted, password);

      expect(decrypted).toBe(plaintext);
    });

    it('should include salt and iterations in encrypted data', async () => {
      const encrypted = await encryptWithPassword(plaintext, password);

      expect(encrypted.salt).toBeTruthy();
      expect(encrypted.iterations).toBe(100000);
    });

    it('should fail decryption with wrong password', async () => {
      const encrypted = await encryptWithPassword(plaintext, password);

      await expect(decryptWithPassword(encrypted, 'wrongPassword')).rejects.toThrow(
        'Decryption failed'
      );
    });
  });

  describe('secureCompare', () => {
    it('should return true for equal buffers', () => {
      const a = Buffer.from('hello');
      const b = Buffer.from('hello');

      expect(secureCompare(a, b)).toBe(true);
    });

    it('should return false for different buffers', () => {
      const a = Buffer.from('hello');
      const b = Buffer.from('world');

      expect(secureCompare(a, b)).toBe(false);
    });

    it('should return false for different length buffers', () => {
      const a = Buffer.from('hello');
      const b = Buffer.from('hello world');

      expect(secureCompare(a, b)).toBe(false);
    });

    it('should return true for empty buffers', () => {
      const a = Buffer.from('');
      const b = Buffer.from('');

      expect(secureCompare(a, b)).toBe(true);
    });
  });

  describe('encoding options', () => {
    const key = generateKey();
    const plaintext = 'Test message';

    it('should support hex encoding', async () => {
      const encrypted = await encrypt(plaintext, key, { encoding: 'hex' });

      expect(encrypted.encoding).toBe('hex');
      expect(/^[0-9a-f]+$/i.test(encrypted.ciphertext)).toBe(true);

      const decrypted = await decrypt(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });

    it('should support base64 encoding', async () => {
      const encrypted = await encrypt(plaintext, key, { encoding: 'base64' });

      expect(encrypted.encoding).toBe('base64');

      const decrypted = await decrypt(encrypted, key);
      expect(decrypted).toBe(plaintext);
    });
  });
});
