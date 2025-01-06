/**
 * Main entry point for the analytics service that exports controllers and services
 * for handling metrics, reporting, and predictive analytics in the autonomous revenue generation platform.
 * @version 1.0.0
 */

import { container } from 'tsyringe'; // v4.8.0
import { Logger, createLogger, format, transports } from 'winston'; // v3.8.0
import CircuitBreaker from 'opossum'; // v6.0.0
import { caching } from 'cache-manager'; // v5.2.0

// Internal imports
import { MetricsController } from './controllers/metrics.controller';
import { PredictionService } from './services/prediction.service';
import { ReportingService } from './services/reporting.service';
import { MetricModel } from './models/metric.model';
import { MetricType } from '../../common/interfaces/metric.interface';

// Initialize logger
const logger: Logger = createLogger({
    level: process.env.LOG_LEVEL || 'info',
    format: format.combine(
        format.timestamp(),
        format.json()
    ),
    defaultMeta: { service: 'analytics-service' },
    transports: [
        new transports.Console(),
        new transports.File({ filename: 'analytics-error.log', level: 'error' }),
        new transports.File({ filename: 'analytics-combined.log' })
    ]
});

// Circuit breaker configuration
const circuitBreakerOptions = {
    timeout: 3000, // 3 seconds
    errorThresholdPercentage: 50,
    resetTimeout: 30000, // 30 seconds
};

// Cache configuration
const cacheConfig = {
    ttl: 300, // 5 minutes
    max: 1000, // Maximum number of items in cache
    store: 'memory'
};

/**
 * Registers all dependencies for the analytics service
 */
async function registerDependencies(): Promise<void> {
    try {
        // Initialize cache manager
        const cacheManager = await caching(cacheConfig);

        // Register MetricModel with cache
        container.register('MetricModel', {
            useValue: new MetricModel(
                container.resolve('DatabasePool'),
                cacheManager,
                logger
            )
        });

        // Register services with circuit breakers
        const predictionBreaker = new CircuitBreaker(
            container.resolve(PredictionService),
            circuitBreakerOptions
        );

        const reportingBreaker = new CircuitBreaker(
            container.resolve(ReportingService),
            circuitBreakerOptions
        );

        container.register('PredictionService', {
            useValue: predictionBreaker
        });

        container.register('ReportingService', {
            useValue: reportingBreaker
        });

        // Register controller
        container.register('MetricsController', {
            useClass: MetricsController
        });

        logger.info('Analytics service dependencies registered successfully');
    } catch (error) {
        logger.error('Failed to register dependencies:', error);
        throw error;
    }
}

/**
 * Initializes the analytics service and its components
 */
async function initializeServices(): Promise<void> {
    try {
        await registerDependencies();

        // Initialize health monitoring
        const metricsController = container.resolve(MetricsController);
        setInterval(async () => {
            try {
                await metricsController.getHealthMetrics({
                    type: MetricType.LATENCY,
                    timestamp: new Date()
                });
            } catch (error) {
                logger.error('Health check failed:', error);
            }
        }, 30000); // Every 30 seconds

        logger.info('Analytics service initialized successfully');
    } catch (error) {
        logger.error('Failed to initialize analytics service:', error);
        throw error;
    }
}

// Export controllers and services
export {
    MetricsController,
    PredictionService,
    ReportingService,
    registerDependencies,
    initializeServices
};

// Initialize service when imported
initializeServices().catch(error => {
    logger.error('Failed to start analytics service:', error);
    process.exit(1);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
});

// Handle shutdown gracefully
process.on('SIGTERM', async () => {
    logger.info('SIGTERM received. Shutting down gracefully...');
    try {
        // Close circuit breakers
        const predictionBreaker = container.resolve('PredictionService');
        const reportingBreaker = container.resolve('ReportingService');
        
        await Promise.all([
            predictionBreaker.shutdown(),
            reportingBreaker.shutdown()
        ]);

        logger.info('Graceful shutdown completed');
        process.exit(0);
    } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        process.exit(1);
    }
});