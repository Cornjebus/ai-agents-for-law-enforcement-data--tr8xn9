import { CustomError } from '../middleware/error';
import * as crypto from 'crypto';

// crypto: Node.js built-in cryptographic functionality

/**
 * Interface defining comprehensive encryption configuration options
 */
export interface EncryptionOptions {
  algorithm: string;
  keySize: number;
  ivLength: number;
}

/**
 * Interface for encrypted data structure with authentication
 */
export interface EncryptedResult {
  iv: Buffer;
  tag: Buffer;
  ciphertext: Buffer;
}

/**
 * Default encryption configuration using AES-256-GCM
 */
const DEFAULT_ENCRYPTION_OPTIONS: EncryptionOptions = {
  algorithm: 'aes-256-gcm',
  keySize: 32, // 256 bits
  ivLength: 16 // 128 bits
};

/**
 * Standard encryption error messages
 */
const ENCRYPTION_ERRORS = {
  INVALID_KEY: 'Invalid encryption key provided',
  INVALID_DATA: 'Invalid data for encryption',
  DECRYPTION_FAILED: 'Data decryption failed',
  AUTHENTICATION_FAILED: 'Data authentication failed',
  MASKING_ERROR: 'Error during data masking'
} as const;

/**
 * Encrypts data using AES-256-GCM with authentication
 * @param data - Data to encrypt (string or Buffer)
 * @param key - Encryption key
 * @param options - Encryption configuration options
 * @returns Promise<EncryptedResult> - Encrypted data with IV and authentication tag
 */
export async function encryptData(
  data: string | Buffer,
  key: Buffer,
  options: EncryptionOptions = DEFAULT_ENCRYPTION_OPTIONS
): Promise<EncryptedResult> {
  try {
    // Validate inputs
    if (!key || key.length !== options.keySize) {
      throw new CustomError(ENCRYPTION_ERRORS.INVALID_KEY, 400);
    }
    if (!data) {
      throw new CustomError(ENCRYPTION_ERRORS.INVALID_DATA, 400);
    }

    // Generate cryptographically secure random IV
    const iv = crypto.randomBytes(options.ivLength);

    // Create cipher with AES-256-GCM
    const cipher = crypto.createCipheriv(options.algorithm, key, iv);

    // Convert data to Buffer if string
    const dataBuffer = Buffer.isBuffer(data) ? data : Buffer.from(data, 'utf8');

    // Encrypt data
    const encryptedData = Buffer.concat([
      cipher.update(dataBuffer),
      cipher.final()
    ]);

    // Get authentication tag
    const tag = cipher.getAuthTag();

    // Clean up sensitive data from memory
    cipher.destroy();

    return {
      iv,
      tag,
      ciphertext: encryptedData
    };
  } catch (error) {
    if (error instanceof CustomError) {
      throw error;
    }
    throw new CustomError(
      `Encryption failed: ${error.message}`,
      500
    );
  }
}

/**
 * Decrypts data using AES-256-GCM with authentication verification
 * @param encryptedData - Encrypted data structure
 * @param key - Decryption key
 * @param options - Encryption configuration options
 * @returns Promise<Buffer> - Decrypted data
 */
export async function decryptData(
  encryptedData: EncryptedResult,
  key: Buffer,
  options: EncryptionOptions = DEFAULT_ENCRYPTION_OPTIONS
): Promise<Buffer> {
  try {
    // Validate inputs
    if (!key || key.length !== options.keySize) {
      throw new CustomError(ENCRYPTION_ERRORS.INVALID_KEY, 400);
    }
    if (!encryptedData?.iv || !encryptedData?.tag || !encryptedData?.ciphertext) {
      throw new CustomError(ENCRYPTION_ERRORS.INVALID_DATA, 400);
    }

    // Create decipher
    const decipher = crypto.createDecipheriv(options.algorithm, key, encryptedData.iv);
    
    // Set authentication tag
    decipher.setAuthTag(encryptedData.tag);

    // Decrypt data
    const decryptedData = Buffer.concat([
      decipher.update(encryptedData.ciphertext),
      decipher.final()
    ]);

    // Clean up sensitive data
    decipher.destroy();

    return decryptedData;
  } catch (error) {
    if (error instanceof CustomError) {
      throw error;
    }
    if (error.message.includes('auth')) {
      throw new CustomError(ENCRYPTION_ERRORS.AUTHENTICATION_FAILED, 400);
    }
    throw new CustomError(ENCRYPTION_ERRORS.DECRYPTION_FAILED, 500);
  }
}

/**
 * Masks sensitive data using configurable patterns
 * @param data - Data to mask
 * @param pattern - Regular expression pattern for matching
 * @param maskChar - Character to use for masking
 * @returns string - Masked data
 */
export function maskSensitiveData(
  data: string,
  pattern: RegExp = /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g,
  maskChar: string = '*'
): string {
  try {
    // Validate inputs
    if (!data) {
      throw new CustomError(ENCRYPTION_ERRORS.INVALID_DATA, 400);
    }
    if (!(pattern instanceof RegExp)) {
      throw new CustomError('Invalid pattern provided', 400);
    }

    // Apply masking
    return data.replace(pattern, (match) => {
      // Keep last 4 characters visible for reference
      const visibleChars = match.slice(-4);
      return maskChar.repeat(match.length - 4) + visibleChars;
    });
  } catch (error) {
    if (error instanceof CustomError) {
      throw error;
    }
    throw new CustomError(ENCRYPTION_ERRORS.MASKING_ERROR, 500);
  }
}

// Export interfaces and constants for external use
export {
  DEFAULT_ENCRYPTION_OPTIONS,
  ENCRYPTION_ERRORS
};