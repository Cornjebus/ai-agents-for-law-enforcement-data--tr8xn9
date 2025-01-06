import express, { Application } from 'express'; // v4.18.0
import { Kong } from '@kong/kong-js'; // v1.5.0
import helmet from 'helmet'; // v7.0.0
import compression from 'compression'; // v1.7.4
import morgan from 'morgan'; // v1.10.0
import CircuitBreaker from 'opossum'; // v6.0.0
import apm from 'elastic-apm-node'; // v3.0.0
import rateLimit from 'express-rate-limit'; // v6.0.0
import correlationId from 'express-correlation-id'; // v2.0.0
import sanitizer from 'express-sanitizer'; // v1.0.6

import { kongConfig } from './config/kong';
import router from './routes';
import { authenticate } from './middleware/auth';

// Environment constants
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';
const API_VERSION = 'v1';

// Circuit breaker configuration
const CIRCUIT_BREAKER_OPTIONS = {
    timeout: 3000,
    errorThresholdPercentage: 50,
    resetTimeout: 30000
};

// Rate limiting configuration
const RATE_LIMIT_OPTIONS = {
    windowMs: 900000, // 15 minutes
    max: 100 // limit each IP to 100 requests per windowMs
};

/**
 * Creates and configures the Express application with enhanced middleware and monitoring
 */
function createApp(): Application {
    // Initialize APM if in production
    if (NODE_ENV === 'production') {
        apm.start({
            serviceName: 'revenue-platform-api',
            serverUrl: process.env.APM_SERVER_URL,
            environment: NODE_ENV
        });
    }

    // Create Express application
    const app = express();

    // Configure enhanced security middleware
    setupMiddleware(app);

    // Configure Kong Gateway with failover
    setupKongGateway(app);

    // Set up API routes with circuit breakers
    const breaker = new CircuitBreaker(router, CIRCUIT_BREAKER_OPTIONS);
    app.use(`/api/${API_VERSION}`, (req, res, next) => {
        breaker.fire(req, res, next)
            .catch(error => next(error));
    });

    // Error handling middleware
    app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
        console.error('API Error:', err);
        res.status(err.status || 500).json({
            error: {
                message: err.message || 'Internal Server Error',
                code: err.code || 'INTERNAL_ERROR',
                correlationId: req.headers['x-correlation-id']
            }
        });
    });

    return app;
}

/**
 * Configures enhanced global middleware chain for the Express application
 */
function setupMiddleware(app: Application): void {
    // Security headers
    app.use(helmet({
        contentSecurityPolicy: true,
        crossOriginEmbedderPolicy: true,
        crossOriginOpenerPolicy: true,
        crossOriginResourcePolicy: true,
        dnsPrefetchControl: true,
        frameguard: true,
        hidePoweredBy: true,
        hsts: true,
        ieNoOpen: true,
        noSniff: true,
        originAgentCluster: true,
        permittedCrossDomainPolicies: true,
        referrerPolicy: true,
        xssFilter: true
    }));

    // Request correlation tracking
    app.use(correlationId());

    // Request sanitization
    app.use(sanitizer());

    // Enhanced request logging
    app.use(morgan('combined', {
        skip: (req) => req.path === '/health'
    }));

    // Response compression
    app.use(compression());

    // Body parsing with limits
    app.use(express.json({ limit: '10mb' }));
    app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting
    app.use(rateLimit(RATE_LIMIT_OPTIONS));

    // APM transaction tracking
    if (NODE_ENV === 'production') {
        app.use(apm.middleware.connect());
    }
}

/**
 * Initializes and configures Kong Gateway with enhanced features
 */
function setupKongGateway(app: Application): void {
    const kong = new Kong(kongConfig);

    // Configure Kong plugins
    kong.usePlugin('cors', {
        origins: process.env.ALLOWED_ORIGINS?.split(',') || [],
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        headers: ['Content-Type', 'Authorization', 'X-Correlation-ID'],
        credentials: true,
        maxAge: 3600
    });

    kong.usePlugin('rate-limiting', {
        minute: RATE_LIMIT_OPTIONS.max,
        policy: 'redis',
        fault_tolerant: true
    });

    kong.usePlugin('prometheus', {
        status_codes: true,
        latency: true,
        bandwidth: true,
        per_consumer: true
    });

    // Apply Kong middleware
    app.use(kong.middleware());
}

/**
 * Starts the Express application server with monitoring
 */
async function startServer(app: Application): Promise<void> {
    try {
        // Initialize health checks
        app.get('/health', (req, res) => {
            res.status(200).json({ status: 'healthy' });
        });

        // Start server
        app.listen(PORT, () => {
            console.log(`Server running on port ${PORT} in ${NODE_ENV} mode`);
            
            if (NODE_ENV === 'production') {
                apm.setTransactionName('server-start');
            }
        });

        // Handle shutdown gracefully
        process.on('SIGTERM', () => {
            console.log('Received SIGTERM. Performing graceful shutdown...');
            // Implement graceful shutdown logic
        });

    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Create and start application
const app = createApp();
startServer(app);

// Export for testing
export { app };