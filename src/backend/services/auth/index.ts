import { config } from 'dotenv'; // v16.3.1
import { asClass, createContainer } from 'awilix'; // v8.0.1
import winston from 'winston'; // v3.10.0
import * as promClient from 'prom-client'; // v14.2.0

import { AuthController } from './controllers/auth.controller';
import { JWTService } from './services/jwt.service';
import { OAuthService } from './services/oauth.service';
import { UserModel } from './models/user.model';
import { createDatabasePool } from '../../common/config/database';
import { DatadogMonitor } from '../../monitoring/datadog';
import { PrometheusMonitor } from '../../monitoring/prometheus';

// Load environment variables
config();

// Authentication service configuration
const AUTH_CONFIG = {
    oauth: {
        clientId: process.env.OAUTH_CLIENT_ID,
        clientSecret: process.env.OAUTH_CLIENT_SECRET,
        redirectUri: process.env.OAUTH_REDIRECT_URI,
        discoveryUrl: process.env.OAUTH_DISCOVERY_URL,
        scope: ['openid', 'profile', 'email'],
        provider: process.env.OAUTH_PROVIDER,
        mfaEnabled: process.env.MFA_ENABLED === 'true',
        ssoEnabled: process.env.SSO_ENABLED === 'true'
    },
    jwt: {
        privateKeyPath: process.env.JWT_PRIVATE_KEY_PATH,
        publicKeyPath: process.env.JWT_PUBLIC_KEY_PATH,
        expiresIn: 3600, // 1 hour
        refreshable: true,
        audience: 'autonomous-revenue-platform',
        issuer: 'auth-service',
        algorithm: 'RS256'
    },
    security: {
        rateLimit: {
            windowMs: 900000, // 15 minutes
            max: 100 // requests per window
        },
        logging: {
            level: 'info',
            auditTrail: true
        }
    },
    performance: {
        caching: {
            enabled: true,
            ttl: 300 // 5 minutes
        },
        monitoring: {
            enabled: true,
            metrics: ['latency', 'requests', 'errors']
        }
    }
};

/**
 * Initializes authentication services with comprehensive configuration,
 * security controls, and monitoring
 */
export async function initializeAuthServices(): Promise<{
    authController: AuthController;
    jwtService: JWTService;
    oauthService: OAuthService;
}> {
    // Initialize logger
    const logger = winston.createLogger({
        level: AUTH_CONFIG.security.logging.level,
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        ),
        transports: [
            new winston.transports.File({ filename: 'logs/auth.log' }),
            new winston.transports.Console()
        ]
    });

    // Initialize metrics collectors
    const datadogMonitor = new DatadogMonitor();
    const prometheusMonitor = new PrometheusMonitor();

    // Initialize Prometheus metrics
    if (AUTH_CONFIG.performance.monitoring.enabled) {
        promClient.collectDefaultMetrics();
        prometheusMonitor.recordMetric({
            id: 'auth_service_initialized',
            name: 'auth.service.initialized',
            type: 'UPTIME',
            value: 1,
            unit: 'COUNT',
            timestamp: new Date(),
            service: 'auth-service',
            environment: process.env.NODE_ENV || 'development',
            metadata: {},
            tags: { version: process.env.APP_VERSION || '1.0.0' }
        });
    }

    try {
        // Initialize dependency injection container
        const container = createContainer();

        // Register database connection
        const dbPool = createDatabasePool();

        // Register core services
        container.register({
            userModel: asClass(UserModel).singleton(),
            jwtService: asClass(JWTService).singleton(),
            oauthService: asClass(OAuthService).singleton(),
            authController: asClass(AuthController).singleton()
        });

        // Initialize JWT service with secure configuration
        const jwtService = new JWTService(
            AUTH_CONFIG.jwt.privateKeyPath,
            AUTH_CONFIG.jwt.publicKeyPath,
            {
                expiresIn: AUTH_CONFIG.jwt.expiresIn,
                audience: AUTH_CONFIG.jwt.audience,
                issuer: AUTH_CONFIG.jwt.issuer
            }
        );

        // Initialize OAuth service with provider configuration
        const oauthService = new OAuthService(
            {
                clientId: AUTH_CONFIG.oauth.clientId!,
                clientSecret: AUTH_CONFIG.oauth.clientSecret!,
                redirectUri: AUTH_CONFIG.oauth.redirectUri!,
                discoveryUrl: AUTH_CONFIG.oauth.discoveryUrl!,
                scope: AUTH_CONFIG.oauth.scope,
                provider: AUTH_CONFIG.oauth.provider!,
                isSaml: false,
                tokenExpirySeconds: AUTH_CONFIG.jwt.expiresIn,
                maxRetries: 3
            },
            new UserModel(dbPool),
            jwtService
        );

        // Initialize authentication controller with security features
        const authController = new AuthController(
            oauthService,
            jwtService,
            new UserModel(dbPool),
            dbPool
        );

        // Log successful initialization
        logger.info('Authentication services initialized successfully', {
            timestamp: new Date().toISOString(),
            config: {
                provider: AUTH_CONFIG.oauth.provider,
                mfaEnabled: AUTH_CONFIG.oauth.mfaEnabled,
                ssoEnabled: AUTH_CONFIG.oauth.ssoEnabled
            }
        });

        // Record initialization metrics
        datadogMonitor.recordMetric({
            id: 'auth_service_startup',
            name: 'auth.service.startup',
            type: 'UPTIME',
            value: 1,
            unit: 'COUNT',
            timestamp: new Date(),
            service: 'auth-service',
            environment: process.env.NODE_ENV || 'development',
            metadata: {},
            tags: { status: 'success' }
        });

        return {
            authController,
            jwtService,
            oauthService
        };

    } catch (error) {
        // Log initialization failure
        logger.error('Authentication services initialization failed', {
            timestamp: new Date().toISOString(),
            error: error.message,
            stack: error.stack
        });

        // Record error metrics
        datadogMonitor.recordMetric({
            id: 'auth_service_startup_error',
            name: 'auth.service.startup.error',
            type: 'ERROR_RATE',
            value: 1,
            unit: 'COUNT',
            timestamp: new Date(),
            service: 'auth-service',
            environment: process.env.NODE_ENV || 'development',
            metadata: { error: error.message },
            tags: { status: 'error' }
        });

        throw error;
    }
}

// Export configuration and services
export {
    AUTH_CONFIG,
    AuthController,
    JWTService,
    OAuthService
};