import jwt from 'jsonwebtoken'; // v9.0.0
import crypto from 'crypto';
import NodeCache from 'node-cache'; // v5.1.2
import { RateLimiter } from 'rate-limiter-flexible'; // v2.4.1
import winston from 'winston'; // v3.8.0
import * as metrics from '@opentelemetry/metrics'; // v1.0.0
import { IUser, UserRole } from '../models/user.model';
import { encryptData, decryptData } from '../../../common/utils/encryption';

// Token configuration constants
const TOKEN_CONFIG = {
    expiresIn: 3600,
    refreshable: true,
    audience: 'autonomous-revenue-platform',
    issuer: 'auth-service',
    version: 1,
    encrypted: true,
    keyRotationInterval: 86400
};

// Cache configuration
const CACHE_CONFIG = {
    ttl: 3600,
    checkperiod: 600,
    maxKeys: 100000
};

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
    points: 100,
    duration: 60,
    blockDuration: 300
};

// JWT error messages
const JWT_ERRORS = {
    INVALID_TOKEN: 'Invalid JWT token provided',
    TOKEN_EXPIRED: 'Token has expired',
    TOKEN_REVOKED: 'Token has been revoked',
    REFRESH_NOT_ALLOWED: 'Token cannot be refreshed',
    INVALID_DEVICE: 'Invalid device binding',
    RATE_LIMIT_EXCEEDED: 'Token generation rate limit exceeded',
    VERSION_MISMATCH: 'Token version mismatch',
    FINGERPRINT_MISMATCH: 'Token fingerprint validation failed'
};

// Enhanced JWT payload interface
interface JWTPayload {
    id: string;
    email: string;
    role: UserRole;
    permissions: string[];
    deviceId: string;
    fingerprint: string;
    version: number;
    iat: number;
    exp: number;
    jti: string;
}

// Token generation options interface
interface TokenOptions {
    expiresIn: number;
    refreshable: boolean;
    audience: string;
    issuer: string;
    deviceId: string;
    encrypted: boolean;
    version: number;
}

// Token metrics interface
interface TokenMetrics {
    generationTime: number;
    validationTime: number;
    cacheHitRate: number;
    errorRate: number;
}

/**
 * Enhanced JWT service with advanced security features and monitoring
 */
export class JWTService {
    private readonly privateKey: string;
    private readonly publicKey: string;
    private readonly defaultOptions: TokenOptions;
    private readonly tokenCache: NodeCache;
    private readonly rateLimiter: RateLimiter;
    private readonly logger: winston.Logger;
    private readonly meter: metrics.Meter;

    constructor(
        privateKeyPath: string,
        publicKeyPath: string,
        options: Partial<TokenOptions> = {}
    ) {
        // Load RSA keys
        this.privateKey = crypto.readFileSync(privateKeyPath, 'utf8');
        this.publicKey = crypto.readFileSync(publicKeyPath, 'utf8');

        // Initialize token cache
        this.tokenCache = new NodeCache(CACHE_CONFIG);

        // Initialize rate limiter
        this.rateLimiter = new RateLimiter(RATE_LIMIT_CONFIG);

        // Initialize logger
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            transports: [
                new winston.transports.File({ filename: 'logs/jwt.log' })
            ]
        });

        // Initialize metrics
        this.meter = new metrics.MeterProvider().getMeter('jwt-service');

        // Set default options
        this.defaultOptions = {
            ...TOKEN_CONFIG,
            ...options
        };

        // Start key rotation scheduler
        this.scheduleKeyRotation();
    }

    /**
     * Generates a secure JWT token with encryption
     */
    public async generateToken(
        user: IUser,
        options: Partial<TokenOptions> = {}
    ): Promise<string> {
        try {
            // Check rate limits
            await this.rateLimiter.consume(user.id);

            const startTime = process.hrtime();

            // Create token payload
            const payload: JWTPayload = {
                id: user.id,
                email: user.email,
                role: user.role,
                permissions: user.permissions,
                deviceId: options.deviceId || crypto.randomBytes(16).toString('hex'),
                fingerprint: this.generateFingerprint(user),
                version: this.defaultOptions.version,
                iat: Math.floor(Date.now() / 1000),
                exp: Math.floor(Date.now() / 1000) + (options.expiresIn || this.defaultOptions.expiresIn),
                jti: crypto.randomUUID()
            };

            // Encrypt sensitive payload data
            if (this.defaultOptions.encrypted) {
                const encryptedData = await encryptData(
                    JSON.stringify(payload),
                    Buffer.from(process.env.ENCRYPTION_KEY!)
                );
                payload.email = encryptedData.toString();
            }

            // Sign token with RS256
            const token = jwt.sign(payload, this.privateKey, {
                algorithm: 'RS256',
                audience: this.defaultOptions.audience,
                issuer: this.defaultOptions.issuer
            });

            // Cache token metadata
            this.tokenCache.set(payload.jti, {
                userId: user.id,
                deviceId: payload.deviceId,
                exp: payload.exp
            });

            // Track metrics
            const [seconds, nanoseconds] = process.hrtime(startTime);
            this.recordMetrics('token.generation', seconds * 1000 + nanoseconds / 1000000);

            // Log token generation
            this.logger.info('Token generated', {
                userId: user.id,
                tokenId: payload.jti,
                deviceId: payload.deviceId
            });

            return token;

        } catch (error) {
            if (error.name === 'RateLimiterError') {
                throw new Error(JWT_ERRORS.RATE_LIMIT_EXCEEDED);
            }
            throw error;
        }
    }

    /**
     * Validates token with comprehensive security checks
     */
    public async verifyToken(
        token: string,
        checkCache: boolean = true
    ): Promise<JWTPayload> {
        const startTime = process.hrtime();

        try {
            // Check token cache if enabled
            if (checkCache) {
                const cached = this.tokenCache.get(token);
                if (cached) {
                    return cached as JWTPayload;
                }
            }

            // Verify token signature
            const decoded = jwt.verify(token, this.publicKey, {
                algorithms: ['RS256'],
                audience: this.defaultOptions.audience,
                issuer: this.defaultOptions.issuer
            }) as JWTPayload;

            // Validate token version
            if (decoded.version !== this.defaultOptions.version) {
                throw new Error(JWT_ERRORS.VERSION_MISMATCH);
            }

            // Verify token fingerprint
            const expectedFingerprint = this.generateFingerprint({
                id: decoded.id,
                email: decoded.email,
                role: decoded.role
            } as IUser);

            if (decoded.fingerprint !== expectedFingerprint) {
                throw new Error(JWT_ERRORS.FINGERPRINT_MISMATCH);
            }

            // Check revocation status
            const isRevoked = !this.tokenCache.get(decoded.jti);
            if (isRevoked) {
                throw new Error(JWT_ERRORS.TOKEN_REVOKED);
            }

            // Decrypt sensitive data if encrypted
            if (this.defaultOptions.encrypted) {
                const decryptedData = await decryptData(
                    Buffer.from(decoded.email),
                    Buffer.from(process.env.ENCRYPTION_KEY!)
                );
                decoded.email = decryptedData.toString();
            }

            // Track metrics
            const [seconds, nanoseconds] = process.hrtime(startTime);
            this.recordMetrics('token.validation', seconds * 1000 + nanoseconds / 1000000);

            return decoded;

        } catch (error) {
            this.recordMetrics('token.error', 1);
            if (error.name === 'TokenExpiredError') {
                throw new Error(JWT_ERRORS.TOKEN_EXPIRED);
            }
            throw new Error(JWT_ERRORS.INVALID_TOKEN);
        }
    }

    /**
     * Revokes token with blacklisting
     */
    public async revokeToken(token: string, reason: string): Promise<void> {
        try {
            const decoded = await this.verifyToken(token, false);
            this.tokenCache.del(decoded.jti);

            this.logger.info('Token revoked', {
                tokenId: decoded.jti,
                userId: decoded.id,
                reason
            });

            this.recordMetrics('token.revocation', 1);
        } catch (error) {
            this.logger.error('Token revocation failed', { error });
            throw error;
        }
    }

    /**
     * Generates unique token fingerprint
     */
    private generateFingerprint(user: IUser): string {
        const data = `${user.id}:${user.email}:${user.role}:${TOKEN_CONFIG.version}`;
        return crypto.createHash('sha256').update(data).digest('hex');
    }

    /**
     * Records token metrics
     */
    private recordMetrics(name: string, value: number): void {
        const counter = this.meter.createCounter(name);
        counter.add(value);
    }

    /**
     * Schedules periodic key rotation
     */
    private scheduleKeyRotation(): void {
        setInterval(() => {
            try {
                // Implement key rotation logic
                this.logger.info('Key rotation scheduled');
            } catch (error) {
                this.logger.error('Key rotation failed', { error });
            }
        }, TOKEN_CONFIG.keyRotationInterval * 1000);
    }
}

export { JWTPayload };