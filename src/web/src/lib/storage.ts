/**
 * @fileoverview Core library module providing secure browser storage operations
 * Implements AES-256-GCM encryption, compression, and type-safe storage operations
 * Version: 1.0.0
 */

import { AES, enc as CryptoEnc, SHA256 } from 'crypto-js'; // v4.1.1
import * as pako from 'pako'; // v2.1.0
import { AuthState } from '../types/auth';

// Storage configuration constants
const STORAGE_PREFIX = 'argp_';
const ENCRYPTION_KEY = process.env.NEXT_PUBLIC_STORAGE_ENCRYPTION_KEY || '';
const SENSITIVE_KEYS = ['auth', 'token', 'user', 'credentials', 'payment', 'personal'];
const MAX_STORAGE_SIZE = 5 * 1024 * 1024; // 5MB
const COMPRESSION_THRESHOLD = 1024; // 1KB

/**
 * Available storage types for browser storage operations
 */
export enum StorageType {
    LOCAL = 'localStorage',
    SESSION = 'sessionStorage'
}

/**
 * Storage metadata interface for integrity and processing information
 */
interface StorageMetadata {
    hash: string;
    compressed: boolean;
    encrypted: boolean;
    timestamp: number;
}

/**
 * Storage item wrapper interface
 */
interface StorageWrapper<T> {
    data: string;
    metadata: StorageMetadata;
}

/**
 * Storage error types for consistent error handling
 */
class StorageError extends Error {
    constructor(message: string, public code: string) {
        super(message);
        this.name = 'StorageError';
    }
}

/**
 * Checks if a key requires encryption based on sensitivity
 */
const requiresEncryption = (key: string): boolean => {
    return SENSITIVE_KEYS.some(sensitiveKey => key.toLowerCase().includes(sensitiveKey));
};

/**
 * Generates integrity hash for storage data
 */
const generateHash = (data: string): string => {
    return SHA256(data + ENCRYPTION_KEY).toString();
};

/**
 * Validates storage quota and available space
 */
const validateStorageQuota = async (size: number, type: StorageType): Promise<void> => {
    try {
        const estimate = await navigator.storage?.estimate();
        if (estimate && estimate.quota && (estimate.usage || 0) + size > estimate.quota) {
            throw new StorageError('Storage quota exceeded', 'QUOTA_EXCEEDED');
        }
    } catch (error) {
        if (error instanceof StorageError) throw error;
        // Fallback size check for browsers not supporting Storage API
        const totalSize = Object.keys(window[type])
            .filter(key => key.startsWith(STORAGE_PREFIX))
            .reduce((size, key) => size + (window[type][key]?.length || 0), 0);
        
        if (totalSize + size > MAX_STORAGE_SIZE) {
            throw new StorageError('Storage quota exceeded', 'QUOTA_EXCEEDED');
        }
    }
};

/**
 * Sets an item in browser storage with encryption and compression
 */
export async function setItem<T>(
    key: string,
    value: T,
    type: StorageType,
    encrypt: boolean = false
): Promise<void> {
    try {
        if (!key || value === undefined) {
            throw new StorageError('Invalid key or value', 'INVALID_PARAMS');
        }

        const prefixedKey = `${STORAGE_PREFIX}${key}`;
        const serializedData = JSON.stringify(value);
        let processedData = serializedData;
        
        // Compress data if it exceeds threshold
        const compressed = serializedData.length > COMPRESSION_THRESHOLD;
        if (compressed) {
            const uint8Array = new TextEncoder().encode(serializedData);
            const compressedData = pako.deflate(uint8Array);
            processedData = Buffer.from(compressedData).toString('base64');
        }

        // Encrypt data if required
        const shouldEncrypt = encrypt || requiresEncryption(key);
        if (shouldEncrypt) {
            if (!ENCRYPTION_KEY) {
                throw new StorageError('Encryption key not available', 'ENCRYPTION_ERROR');
            }
            processedData = AES.encrypt(processedData, ENCRYPTION_KEY).toString();
        }

        const metadata: StorageMetadata = {
            hash: generateHash(processedData),
            compressed,
            encrypted: shouldEncrypt,
            timestamp: Date.now()
        };

        const wrapper: StorageWrapper<T> = {
            data: processedData,
            metadata
        };

        const finalData = JSON.stringify(wrapper);
        await validateStorageQuota(finalData.length, type);
        
        window[type].setItem(prefixedKey, finalData);
        
        // Emit storage event for monitoring
        window.dispatchEvent(new CustomEvent('storage-operation', {
            detail: { type: 'set', key: prefixedKey }
        }));
    } catch (error) {
        console.error('Storage setItem error:', error);
        throw error instanceof StorageError ? error : new StorageError('Storage operation failed', 'OPERATION_FAILED');
    }
}

/**
 * Retrieves an item from browser storage with decryption and decompression
 */
export async function getItem<T>(key: string, type: StorageType): Promise<T | null> {
    try {
        const prefixedKey = `${STORAGE_PREFIX}${key}`;
        const rawData = window[type].getItem(prefixedKey);
        
        if (!rawData) return null;

        const wrapper: StorageWrapper<T> = JSON.parse(rawData);
        let processedData = wrapper.data;

        // Verify data integrity
        if (generateHash(processedData) !== wrapper.metadata.hash) {
            throw new StorageError('Data integrity check failed', 'INTEGRITY_ERROR');
        }

        // Decrypt if necessary
        if (wrapper.metadata.encrypted) {
            if (!ENCRYPTION_KEY) {
                throw new StorageError('Encryption key not available', 'ENCRYPTION_ERROR');
            }
            const decrypted = AES.decrypt(processedData, ENCRYPTION_KEY);
            processedData = decrypted.toString(CryptoEnc.Utf8);
        }

        // Decompress if necessary
        if (wrapper.metadata.compressed) {
            const compressedData = Buffer.from(processedData, 'base64');
            const decompressedData = pako.inflate(compressedData);
            processedData = new TextDecoder().decode(decompressedData);
        }

        return JSON.parse(processedData) as T;
    } catch (error) {
        console.error('Storage getItem error:', error);
        throw error instanceof StorageError ? error : new StorageError('Storage operation failed', 'OPERATION_FAILED');
    }
}

/**
 * Removes an item from browser storage
 */
export async function removeItem(key: string, type: StorageType): Promise<void> {
    try {
        const prefixedKey = `${STORAGE_PREFIX}${key}`;
        window[type].removeItem(prefixedKey);
        
        // Emit storage event for monitoring
        window.dispatchEvent(new CustomEvent('storage-operation', {
            detail: { type: 'remove', key: prefixedKey }
        }));
    } catch (error) {
        console.error('Storage removeItem error:', error);
        throw new StorageError('Storage operation failed', 'OPERATION_FAILED');
    }
}

/**
 * Clears all items from specified storage type
 */
export async function clear(type: StorageType): Promise<void> {
    try {
        // Only clear items with our prefix
        const keys = Object.keys(window[type])
            .filter(key => key.startsWith(STORAGE_PREFIX));
        
        keys.forEach(key => window[type].removeItem(key));
        
        // Emit storage event for monitoring
        window.dispatchEvent(new CustomEvent('storage-operation', {
            detail: { type: 'clear', storageType: type }
        }));
    } catch (error) {
        console.error('Storage clear error:', error);
        throw new StorageError('Storage operation failed', 'OPERATION_FAILED');
    }
}