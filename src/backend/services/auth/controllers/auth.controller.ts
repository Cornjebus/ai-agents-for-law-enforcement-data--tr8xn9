import { Request, Response } from 'express';
import { z } from 'zod'; // v3.22.0
import { OAuthService } from '../services/oauth.service';
import { JWTService } from '../services/jwt.service';
import { UserModel, IUser, UserRole, IUserSession } from '../models/user.model';
import { ValidationError } from '../../../common/utils/validation';
import { DatadogMonitor } from '../../../monitoring/datadog';
import { PrometheusMonitor } from '../../../monitoring/prometheus';
import { MetricType, MetricUnit } from '../../../common/interfaces/metric.interface';
import Redis from 'ioredis'; // v5.3.0

// Validation schemas
const loginSchema = z.object({
    email: z.string().email(),
    password: z.string().min(12),
    deviceId: z.string().optional()
});

const callbackSchema = z.object({
    code: z.string().min(1),
    state: z.string().min(32),
    deviceId: z.string().optional()
});

const refreshSchema = z.object({
    refreshToken: z.string().min(1),
    deviceId: z.string().optional()
});

const logoutSchema = z.object({
    token: z.string().min(1),
    allDevices: z.boolean().optional()
});

// Error messages
const AUTH_ERRORS = {
    INVALID_CREDENTIALS: 'Invalid login credentials provided',
    INVALID_TOKEN: 'Invalid or expired token',
    UNAUTHORIZED: 'Unauthorized access attempt',
    SESSION_EXPIRED: 'Session has expired',
    RATE_LIMIT_EXCEEDED: 'Too many authentication attempts',
    INVALID_DEVICE: 'Unrecognized device fingerprint',
    ROLE_UNAUTHORIZED: 'User role not authorized',
    TOKEN_REVOKED: 'Token has been revoked'
};

/**
 * Enhanced authentication controller implementing secure OAuth 2.0 + OIDC flows
 */
export class AuthController {
    private readonly datadogMonitor: DatadogMonitor;
    private readonly prometheusMonitor: PrometheusMonitor;
    private readonly sessionCache: Redis;

    constructor(
        private readonly oauthService: OAuthService,
        private readonly jwtService: JWTService,
        private readonly userModel: UserModel,
        private readonly cacheClient: Redis
    ) {
        this.datadogMonitor = new DatadogMonitor();
        this.prometheusMonitor = new PrometheusMonitor();
        this.sessionCache = cacheClient;
    }

    /**
     * Initiates OAuth login flow with enhanced security
     */
    public async login(req: Request, res: Response): Promise<void> {
        const startTime = process.hrtime();

        try {
            // Validate request
            const data = loginSchema.parse(req.body);

            // Generate secure state parameter
            const state = crypto.randomBytes(32).toString('hex');
            const deviceId = data.deviceId || crypto.randomBytes(16).toString('hex');

            // Store state with device binding
            await this.sessionCache.setex(
                `auth:state:${state}`,
                300, // 5 minute TTL
                JSON.stringify({ deviceId, timestamp: Date.now() })
            );

            // Generate OAuth URL
            const authUrl = await this.oauthService.authenticate({
                state,
                deviceId
            });

            // Record metrics
            this.recordAuthMetric('auth.login.attempt', startTime);

            res.json({ url: authUrl });

        } catch (error) {
            this.handleAuthError(error, req, res);
        }
    }

    /**
     * Handles OAuth callback with comprehensive validation
     */
    public async callback(req: Request, res: Response): Promise<void> {
        const startTime = process.hrtime();

        try {
            // Validate callback parameters
            const data = callbackSchema.parse(req.query);

            // Verify state and device binding
            const stateData = await this.sessionCache.get(`auth:state:${data.state}`);
            if (!stateData) {
                throw new ValidationError(
                    AUTH_ERRORS.INVALID_TOKEN,
                    { state: ['Invalid or expired state parameter'] },
                    'AUTH_001'
                );
            }

            const { deviceId } = JSON.parse(stateData);

            // Process OAuth callback
            const user = await this.oauthService.handleCallback(
                data.code,
                data.state,
                deviceId
            );

            // Generate JWT tokens
            const accessToken = await this.jwtService.generateToken(user, {
                deviceId,
                expiresIn: 3600 // 1 hour
            });

            const refreshToken = await this.jwtService.generateToken(user, {
                deviceId,
                expiresIn: 2592000 // 30 days
            });

            // Store session data
            const sessionId = crypto.randomUUID();
            await this.sessionCache.setex(
                `auth:session:${sessionId}`,
                3600,
                JSON.stringify({
                    userId: user.id,
                    deviceId,
                    role: user.role,
                    permissions: user.permissions
                })
            );

            // Record metrics
            this.recordAuthMetric('auth.login.success', startTime);

            // Set secure cookie options
            const cookieOptions = {
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                maxAge: 3600000 // 1 hour
            };

            // Return tokens in secure cookies
            res.cookie('access_token', accessToken, cookieOptions);
            res.cookie('refresh_token', refreshToken, {
                ...cookieOptions,
                maxAge: 2592000000 // 30 days
            });

            res.json({
                sessionId,
                user: {
                    id: user.id,
                    email: user.email,
                    role: user.role
                }
            });

        } catch (error) {
            this.handleAuthError(error, req, res);
        }
    }

    /**
     * Refreshes access token with security validation
     */
    public async refresh(req: Request, res: Response): Promise<void> {
        const startTime = process.hrtime();

        try {
            // Validate refresh token
            const data = refreshSchema.parse(req.body);
            const decoded = await this.jwtService.verifyToken(data.refreshToken);

            // Verify device binding
            if (decoded.deviceId !== data.deviceId) {
                throw new ValidationError(
                    AUTH_ERRORS.INVALID_DEVICE,
                    { device: ['Device mismatch detected'] },
                    'AUTH_002'
                );
            }

            // Generate new access token
            const user = await this.userModel.findByEmail(decoded.email);
            const accessToken = await this.jwtService.generateToken(user!, {
                deviceId: decoded.deviceId,
                expiresIn: 3600
            });

            // Record metrics
            this.recordAuthMetric('auth.token.refresh', startTime);

            res.json({ accessToken });

        } catch (error) {
            this.handleAuthError(error, req, res);
        }
    }

    /**
     * Handles logout with comprehensive cleanup
     */
    public async logout(req: Request, res: Response): Promise<void> {
        const startTime = process.hrtime();

        try {
            // Validate request
            const data = logoutSchema.parse(req.body);

            // Revoke tokens
            await this.jwtService.revokeToken(data.token, 'User logout');

            if (data.allDevices) {
                // Revoke all user sessions
                const decoded = await this.jwtService.verifyToken(data.token);
                await this.sessionCache.del(`auth:sessions:${decoded.id}`);
            }

            // Clear secure cookies
            res.clearCookie('access_token');
            res.clearCookie('refresh_token');

            // Record metrics
            this.recordAuthMetric('auth.logout', startTime);

            res.json({ message: 'Logout successful' });

        } catch (error) {
            this.handleAuthError(error, req, res);
        }
    }

    /**
     * Records authentication metrics
     */
    private recordAuthMetric(name: string, startTime: [number, number]): void {
        const [seconds, nanoseconds] = process.hrtime(startTime);
        const duration = seconds * 1000 + nanoseconds / 1000000;

        this.datadogMonitor.recordMetric({
            id: crypto.randomUUID(),
            name,
            type: MetricType.LATENCY,
            value: duration,
            unit: MetricUnit.MILLISECONDS,
            timestamp: new Date(),
            service: 'auth-service',
            environment: process.env.NODE_ENV || 'development',
            metadata: {},
            tags: { endpoint: name }
        });

        this.prometheusMonitor.recordMetric({
            id: crypto.randomUUID(),
            name: `auth_${name.replace(/\./g, '_')}`,
            type: MetricType.LATENCY,
            value: duration,
            unit: MetricUnit.MILLISECONDS,
            timestamp: new Date(),
            service: 'auth-service',
            environment: process.env.NODE_ENV || 'development',
            metadata: {},
            tags: { endpoint: name }
        });
    }

    /**
     * Handles authentication errors with monitoring
     */
    private handleAuthError(error: any, req: Request, res: Response): void {
        const errorResponse = {
            error: {
                message: error.message || AUTH_ERRORS.UNAUTHORIZED,
                code: error.code || 'AUTH_ERROR'
            }
        };

        // Record error metrics
        this.datadogMonitor.recordMetric({
            id: crypto.randomUUID(),
            name: 'auth.error',
            type: MetricType.ERROR_RATE,
            value: 1,
            unit: MetricUnit.COUNT,
            timestamp: new Date(),
            service: 'auth-service',
            environment: process.env.NODE_ENV || 'development',
            metadata: { error: error.message },
            tags: { type: error.code || 'AUTH_ERROR' }
        });

        res.status(error instanceof ValidationError ? 400 : 401).json(errorResponse);
    }
}

export { AUTH_ERRORS };