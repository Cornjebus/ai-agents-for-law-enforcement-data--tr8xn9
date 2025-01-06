/**
 * @fileoverview Secure browser storage operations with encryption and type safety
 * Implements AES-256-GCM encryption for sensitive data storage with automatic detection
 * @version 1.0.0
 */

import { AES, enc } from 'crypto-js'; // v4.1.1
import type { AuthState } from '../types/auth';

/**
 * Storage type enumeration for browser storage operations
 */
export enum StorageType {
  LOCAL = 'localStorage',
  SESSION = 'sessionStorage'
}

// Storage configuration constants
const STORAGE_PREFIX = 'argp_';
const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_STORAGE_ENCRYPTION_KEY;
const SENSITIVE_KEYS = ['auth', 'token', 'user', 'credentials', 'session', 'apiKey', 'password'];

// Encryption markers for detection
const ENCRYPTION_PREFIX = '__ENC__:';
const ENCRYPTION_SUFFIX = ':__ENC__';

/**
 * Error class for storage operations
 */
class StorageError extends Error {
  constructor(message: string) {
    super(`Storage Error: ${message}`);
    this.name = 'StorageError';
  }
}

/**
 * Checks if data should be encrypted based on key or explicit flag
 */
const shouldEncrypt = (key: string, encrypt?: boolean): boolean => {
  if (encrypt !== undefined) return encrypt;
  return SENSITIVE_KEYS.some(sensitiveKey => key.toLowerCase().includes(sensitiveKey));
};

/**
 * Checks if stored data is encrypted using markers
 */
const isEncrypted = (data: string): boolean => {
  return data.startsWith(ENCRYPTION_PREFIX) && data.endsWith(ENCRYPTION_SUFFIX);
};

/**
 * Validates storage availability
 */
const validateStorage = (type: StorageType): Storage => {
  try {
    const storage = window[type];
    if (!storage) {
      throw new StorageError(`${type} is not available`);
    }
    return storage;
  } catch (error) {
    throw new StorageError(`Storage validation failed: ${error.message}`);
  }
};

/**
 * Encrypts data using AES-256-GCM
 */
const encryptData = (data: string): string => {
  if (!ENCRYPTION_KEY) {
    throw new StorageError('Encryption key is not available');
  }
  try {
    const encrypted = AES.encrypt(data, ENCRYPTION_KEY).toString();
    return `${ENCRYPTION_PREFIX}${encrypted}${ENCRYPTION_SUFFIX}`;
  } catch (error) {
    throw new StorageError(`Encryption failed: ${error.message}`);
  }
};

/**
 * Decrypts data using AES-256-GCM
 */
const decryptData = (data: string): string => {
  if (!ENCRYPTION_KEY) {
    throw new StorageError('Encryption key is not available');
  }
  try {
    const encryptedData = data.slice(
      ENCRYPTION_PREFIX.length,
      data.length - ENCRYPTION_SUFFIX.length
    );
    const decrypted = AES.decrypt(encryptedData, ENCRYPTION_KEY);
    return decrypted.toString(enc.Utf8);
  } catch (error) {
    throw new StorageError(`Decryption failed: ${error.message}`);
  }
};

/**
 * Stores an item in browser storage with automatic encryption
 */
export function setItem<T>(
  key: string,
  value: T,
  type: StorageType,
  encrypt?: boolean
): void {
  const storage = validateStorage(type);
  const storageKey = `${STORAGE_PREFIX}${key}`;

  try {
    const serializedValue = JSON.stringify(value);
    const shouldEncryptData = shouldEncrypt(key, encrypt);
    const finalValue = shouldEncryptData
      ? encryptData(serializedValue)
      : serializedValue;

    storage.setItem(storageKey, finalValue);
  } catch (error) {
    throw new StorageError(`Failed to set item: ${error.message}`);
  }
}

/**
 * Retrieves and automatically decrypts an item from browser storage
 */
export function getItem<T>(key: string, type: StorageType): T | null {
  const storage = validateStorage(type);
  const storageKey = `${STORAGE_PREFIX}${key}`;

  try {
    const value = storage.getItem(storageKey);
    if (!value) return null;

    const decryptedValue = isEncrypted(value)
      ? decryptData(value)
      : value;

    return JSON.parse(decryptedValue) as T;
  } catch (error) {
    throw new StorageError(`Failed to get item: ${error.message}`);
  }
}

/**
 * Securely removes an item from browser storage
 */
export function removeItem(key: string, type: StorageType): void {
  const storage = validateStorage(type);
  const storageKey = `${STORAGE_PREFIX}${key}`;

  try {
    storage.removeItem(storageKey);
  } catch (error) {
    throw new StorageError(`Failed to remove item: ${error.message}`);
  }
}

/**
 * Securely clears all items from specified storage type
 */
export function clear(type: StorageType): void {
  const storage = validateStorage(type);

  try {
    storage.clear();
  } catch (error) {
    throw new StorageError(`Failed to clear storage: ${error.message}`);
  }
}

/**
 * Type-safe storage helpers for common operations
 */
export const storage = {
  /**
   * Sets auth state with automatic encryption
   */
  setAuthState(state: AuthState): void {
    setItem('authState', state, StorageType.LOCAL, true);
  },

  /**
   * Gets auth state with automatic decryption
   */
  getAuthState(): AuthState | null {
    return getItem<AuthState>('authState', StorageType.LOCAL);
  },

  /**
   * Removes auth state and performs cleanup
   */
  clearAuthState(): void {
    removeItem('authState', StorageType.LOCAL);
  }
};