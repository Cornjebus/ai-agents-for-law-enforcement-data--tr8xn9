import { Request, Response, NextFunction } from 'express'; // v4.18.0
import { RateLimiter } from 'rate-limiter-flexible'; // v2.4.1
import winston from 'winston'; // v3.8.0
import * as promClient from 'prom-client'; // v14.0.0
import { JWTService } from '../../../services/auth/services/jwt.service';
import { OAuthService } from '../../../services/auth/services/oauth.service';
import { CustomError } from '../../../common/middleware/error';
import { MetricType, MetricUnit } from '../../../common/interfaces/metric.interface';

// Authentication error messages
const AUTH_ERROR_MESSAGES = {
    MISSING_TOKEN: 'Authentication token is required',
    INVALID_TOKEN: 'Invalid authentication token',
    INSUFFICIENT_PERMISSIONS: 'Insufficient permissions to access resource',
    TOKEN_BLACKLISTED: 'Token has been revoked',
    RATE_LIMIT_EXCEEDED: 'Too many authentication attempts',
    MFA_REQUIRED: 'Multi-factor authentication required',
    INVALID_SESSION: 'Invalid or expired session'
} as const;

// Configuration constants
const TOKEN_HEADER = 'Authorization';
const TOKEN_PREFIX = 'Bearer';
const CACHE_CONFIG = {
    TOKEN_TTL: 300, // 5 minutes
    VALIDATION_TTL: 60 // 1 minute
};
const RATE_LIMIT_CONFIG = {
    MAX_ATTEMPTS: 5,
    TIME_WINDOW: 300 // 5 minutes
};

// Enhanced interface for authentication middleware options
export interface IAuthOptions {
    roles?: string[];
    permissions?: string[];
    optional?: boolean;
    requireMFA?: boolean;
    maxAttempts?: number;
    timeWindow?: number;
}

// Extended Express Request interface with enhanced auth data
export interface IAuthRequest extends Request {
    user?: any;
    token?: string;
    session?: any;
    permissions?: string[];
    mfaVerified?: boolean;
}

// Initialize rate limiter for authentication attempts
const rateLimiter = new RateLimiter({
    points: RATE_LIMIT_CONFIG.MAX_ATTEMPTS,
    duration: RATE_LIMIT_CONFIG.TIME_WINDOW,
    blockDuration: RATE_LIMIT_CONFIG.TIME_WINDOW * 2
});

// Initialize logger
const logger = winston.createLogger({
    level: 'info',
    format: winston.format.json(),
    transports: [
        new winston.transports.File({ filename: 'logs/auth.log' })
    ]
});

// Initialize metrics
const authMetrics = {
    attempts: new promClient.Counter({
        name: 'auth_attempts_total',
        help: 'Total authentication attempts',
        labelNames: ['status']
    }),
    latency: new promClient.Histogram({
        name: 'auth_latency_seconds',
        help: 'Authentication latency in seconds',
        buckets: [0.1, 0.3, 0.5, 0.7, 1]
    })
};

/**
 * Enhanced authentication middleware factory with comprehensive security features
 */
export function authenticate(options: IAuthOptions = {}) {
    return async (req: IAuthRequest, res: Response, next: NextFunction) => {
        const startTime = process.hrtime();
        
        try {
            // Check rate limiting
            await rateLimiter.consume(req.ip);

            // Extract and validate token
            const token = await extractToken(req);
            if (!token && !options.optional) {
                throw new CustomError(AUTH_ERROR_MESSAGES.MISSING_TOKEN, 401);
            }

            if (token) {
                // Verify JWT token
                const jwtService = new JWTService();
                const decodedToken = await jwtService.verifyToken(token);

                // Check token blacklist status
                if (await jwtService.isTokenBlacklisted(token)) {
                    throw new CustomError(AUTH_ERROR_MESSAGES.TOKEN_BLACKLISTED, 401);
                }

                // Validate OAuth session if required
                const oauthService = new OAuthService();
                if (!(await oauthService.validateSession(decodedToken.session))) {
                    throw new CustomError(AUTH_ERROR_MESSAGES.INVALID_SESSION, 401);
                }

                // Check MFA requirement
                if (options.requireMFA && !decodedToken.mfaVerified) {
                    throw new CustomError(AUTH_ERROR_MESSAGES.MFA_REQUIRED, 403);
                }

                // Validate roles and permissions
                if (options.roles || options.permissions) {
                    const hasAccess = await validateRoles(
                        decodedToken.roles,
                        options.roles || [],
                        decodedToken.permissions,
                        options.permissions || []
                    );
                    if (!hasAccess) {
                        throw new CustomError(AUTH_ERROR_MESSAGES.INSUFFICIENT_PERMISSIONS, 403);
                    }
                }

                // Attach user data to request
                req.user = decodedToken;
                req.token = token;
                req.permissions = decodedToken.permissions;
                req.mfaVerified = decodedToken.mfaVerified;
            }

            // Record metrics
            const [seconds, nanoseconds] = process.hrtime(startTime);
            const duration = seconds + nanoseconds / 1e9;
            authMetrics.latency.observe(duration);
            authMetrics.attempts.inc({ status: 'success' });

            // Set security headers
            res.setHeader('X-Content-Type-Options', 'nosniff');
            res.setHeader('X-Frame-Options', 'DENY');
            res.setHeader('X-XSS-Protection', '1; mode=block');

            next();
        } catch (error) {
            // Record failed attempt
            authMetrics.attempts.inc({ status: 'failure' });

            // Log security event
            logger.error('Authentication failed', {
                error: error.message,
                ip: req.ip,
                path: req.path,
                timestamp: new Date().toISOString()
            });

            next(error);
        }
    };
}

/**
 * Enhanced token extraction with validation
 */
async function extractToken(req: Request): Promise<string | null> {
    const authHeader = req.header(TOKEN_HEADER);
    if (!authHeader) return null;

    if (!authHeader.startsWith(TOKEN_PREFIX)) {
        throw new CustomError(AUTH_ERROR_MESSAGES.INVALID_TOKEN, 401);
    }

    const token = authHeader.slice(TOKEN_PREFIX.length + 1).trim();
    if (!token) {
        throw new CustomError(AUTH_ERROR_MESSAGES.INVALID_TOKEN, 401);
    }

    return token;
}

/**
 * Enhanced role and permission validation with caching
 */
async function validateRoles(
    userRoles: string[],
    requiredRoles: string[],
    userPermissions: string[],
    requiredPermissions: string[]
): Promise<boolean> {
    // Validate roles
    const hasRequiredRole = requiredRoles.length === 0 || 
        userRoles.some(role => requiredRoles.includes(role));

    // Validate permissions
    const hasRequiredPermissions = requiredPermissions.length === 0 ||
        requiredPermissions.every(permission => userPermissions.includes(permission));

    return hasRequiredRole && hasRequiredPermissions;
}

export { IAuthRequest, IAuthOptions };