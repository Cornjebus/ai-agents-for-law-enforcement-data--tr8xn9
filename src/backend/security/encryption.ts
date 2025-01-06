import { injectable, singleton } from 'inversify';
import { KMSClient, GenerateDataKeyCommand, EncryptCommand, DecryptCommand } from '@aws-sdk/client-kms';
import * as crypto from 'crypto';
import { encryptData } from '../../common/utils/encryption';
import { CustomError } from '../../common/middleware/error';

// @aws-sdk/client-kms: ^3.0.0
// crypto: built-in Node.js module

/**
 * Enhanced interface for encryption service capabilities with HSM support
 */
export interface IEncryptionService {
  encryptField(data: string | Buffer, context: Record<string, string>, options?: EncryptionOptions): Promise<Buffer>;
  decryptField(encryptedData: Buffer, context: Record<string, string>, options?: DecryptionOptions): Promise<Buffer>;
  generateKey(keySpec: string, description: string, tags?: Record<string, string>): Promise<string>;
  rotateKey(keyId: string, options?: RotationOptions): Promise<void>;
  validateKey(keyId: string): Promise<boolean>;
}

/**
 * Interface for key configuration with HSM support
 */
export interface IKeyConfig {
  keyId: string;
  region: string;
  algorithm: string;
  keySpec: string;
  hsmPoolId: string;
  rotationPeriod: number;
  tags: Record<string, string>;
}

/**
 * Interface for encryption options
 */
interface EncryptionOptions {
  algorithm?: string;
  additionalContext?: Record<string, string>;
  keyId?: string;
}

/**
 * Interface for decryption options
 */
interface DecryptionOptions {
  verifyContext?: boolean;
  keyId?: string;
}

/**
 * Interface for key rotation options
 */
interface RotationOptions {
  immediate?: boolean;
  backupKey?: boolean;
}

/**
 * Interface for cached key data
 */
interface CachedKey {
  key: Buffer;
  expiresAt: number;
  context: Record<string, string>;
}

/**
 * Enhanced encryption service implementation with AWS KMS and HSM integration
 */
@injectable()
@singleton()
export class EncryptionService implements IEncryptionService {
  private kmsClient: KMSClient;
  private keyCache: Map<string, CachedKey>;
  private readonly KEY_CACHE_TTL = 3600000; // 1 hour
  private readonly ENCRYPTION_ALGORITHM = 'aes-256-gcm';

  constructor(private keyConfig: IKeyConfig) {
    this.initializeService();
  }

  /**
   * Initializes the encryption service with KMS and HSM configuration
   */
  private initializeService(): void {
    this.kmsClient = new KMSClient({
      region: this.keyConfig.region,
      maxAttempts: 3
    });
    this.keyCache = new Map();
  }

  /**
   * Encrypts a field using KMS and AES-256-GCM with context-based security
   */
  public async encryptField(
    data: string | Buffer,
    context: Record<string, string>,
    options: EncryptionOptions = {}
  ): Promise<Buffer> {
    try {
      // Validate inputs
      if (!data) {
        throw new CustomError('Invalid data for encryption', 400);
      }

      // Generate data key using KMS with HSM
      const dataKey = await this.generateDataKey(options.keyId || this.keyConfig.keyId, context);

      // Encrypt data using AES-256-GCM
      const encryptedData = await encryptData(
        data,
        dataKey.key,
        { algorithm: options.algorithm || this.ENCRYPTION_ALGORITHM }
      );

      // Combine encrypted key and data
      return Buffer.concat([
        dataKey.encryptedKey,
        encryptedData.iv,
        encryptedData.tag,
        encryptedData.ciphertext
      ]);
    } catch (error) {
      throw new CustomError(`Encryption failed: ${error.message}`, 500);
    }
  }

  /**
   * Decrypts a field using KMS and AES-256-GCM with enhanced security
   */
  public async decryptField(
    encryptedData: Buffer,
    context: Record<string, string>,
    options: DecryptionOptions = {}
  ): Promise<Buffer> {
    try {
      // Extract components
      const encryptedKey = encryptedData.slice(0, 512);
      const iv = encryptedData.slice(512, 528);
      const tag = encryptedData.slice(528, 544);
      const ciphertext = encryptedData.slice(544);

      // Decrypt data key using KMS
      const dataKey = await this.decryptDataKey(encryptedKey, context);

      // Create decipher
      const decipher = crypto.createDecipheriv(this.ENCRYPTION_ALGORITHM, dataKey, iv);
      decipher.setAuthTag(tag);

      // Decrypt data
      const decrypted = Buffer.concat([
        decipher.update(ciphertext),
        decipher.final()
      ]);

      // Clean up sensitive data
      dataKey.fill(0);
      return decrypted;
    } catch (error) {
      throw new CustomError(`Decryption failed: ${error.message}`, 500);
    }
  }

  /**
   * Generates a new KMS key with HSM backing
   */
  public async generateKey(
    keySpec: string,
    description: string,
    tags?: Record<string, string>
  ): Promise<string> {
    try {
      const command = new GenerateDataKeyCommand({
        KeyId: this.keyConfig.keyId,
        KeySpec: keySpec,
        EncryptionContext: {
          ...tags,
          hsmPoolId: this.keyConfig.hsmPoolId
        }
      });

      const response = await this.kmsClient.send(command);
      return response.KeyId!;
    } catch (error) {
      throw new CustomError(`Key generation failed: ${error.message}`, 500);
    }
  }

  /**
   * Rotates an existing encryption key with security controls
   */
  public async rotateKey(keyId: string, options: RotationOptions = {}): Promise<void> {
    try {
      // Generate new key version
      const newKeyId = await this.generateKey(
        this.keyConfig.keySpec,
        'Rotated key',
        { originalKeyId: keyId }
      );

      // Update key metadata
      await this.updateKeyMetadata(keyId, newKeyId);

      // Clear key cache
      this.keyCache.clear();
    } catch (error) {
      throw new CustomError(`Key rotation failed: ${error.message}`, 500);
    }
  }

  /**
   * Validates a key's existence and status
   */
  public async validateKey(keyId: string): Promise<boolean> {
    try {
      const command = new EncryptCommand({
        KeyId: keyId,
        Plaintext: Buffer.from('test'),
        EncryptionContext: {
          purpose: 'validation'
        }
      });

      await this.kmsClient.send(command);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generates a data key using KMS with caching
   */
  private async generateDataKey(
    keyId: string,
    context: Record<string, string>
  ): Promise<{ key: Buffer; encryptedKey: Buffer }> {
    const cacheKey = `${keyId}-${JSON.stringify(context)}`;
    const cached = this.keyCache.get(cacheKey);

    if (cached && Date.now() < cached.expiresAt) {
      return {
        key: cached.key,
        encryptedKey: Buffer.alloc(0) // Cached key doesn't need encrypted version
      };
    }

    const command = new GenerateDataKeyCommand({
      KeyId: keyId,
      KeySpec: 'AES_256',
      EncryptionContext: context
    });

    const response = await this.kmsClient.send(command);
    const key = Buffer.from(response.Plaintext!);
    const encryptedKey = Buffer.from(response.CiphertextBlob!);

    // Cache the key
    this.keyCache.set(cacheKey, {
      key: Buffer.from(key),
      expiresAt: Date.now() + this.KEY_CACHE_TTL,
      context
    });

    return { key, encryptedKey };
  }

  /**
   * Decrypts a data key using KMS
   */
  private async decryptDataKey(
    encryptedKey: Buffer,
    context: Record<string, string>
  ): Promise<Buffer> {
    const command = new DecryptCommand({
      CiphertextBlob: encryptedKey,
      EncryptionContext: context
    });

    const response = await this.kmsClient.send(command);
    return Buffer.from(response.Plaintext!);
  }

  /**
   * Updates key metadata after rotation
   */
  private async updateKeyMetadata(oldKeyId: string, newKeyId: string): Promise<void> {
    // Implementation for updating key metadata
    // This would typically involve updating key aliases and tags
  }
}