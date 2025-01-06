import { Kong } from '@kong/kong-js'; // v1.5.0
import dotenv from 'dotenv'; // v16.0.0
import { authenticate } from '../middleware/auth';
import { createRateLimiter } from '../middleware/rateLimit';
import { validateRequest } from '../middleware/validation';

// Load environment variables
dotenv.config();

/**
 * Interface for Kong Gateway configuration
 */
interface KongConfig {
    serviceName: string;
    routePrefix: string;
    port: number;
    host: string;
    services: ServiceConfig[];
    plugins: PluginConfig[];
    redis: RedisConfig;
    cache: CacheConfig;
    monitoring: MonitoringConfig;
    circuitBreaker: CircuitBreakerConfig;
}

/**
 * Interface for Kong service configuration
 */
interface ServiceConfig {
    name: string;
    url: string;
    routes: string[];
    plugins: PluginConfig[];
    healthCheck: HealthCheckConfig;
    retry: RetryConfig;
    rateLimit: RateLimitConfig;
}

/**
 * Interface for Kong plugin configuration
 */
interface PluginConfig {
    name: string;
    enabled: boolean;
    config: Record<string, any>;
    priority: number;
    error: ErrorConfig;
}

/**
 * Default rate limiting configuration
 */
const DEFAULT_RATE_LIMIT = {
    windowMs: 60000, // 1 minute
    maxRequests: 100,
    keyPrefix: 'api-rate-limit',
    redis: {
        host: process.env.REDIS_HOST,
        port: process.env.REDIS_PORT,
        password: process.env.REDIS_PASSWORD,
        cluster: true
    }
};

/**
 * API service configurations
 */
const API_SERVICES = [
    {
        name: 'campaign-service',
        url: 'http://campaign-service:3000',
        routes: ['/api/v1/campaigns'],
        healthCheck: {
            path: '/health',
            interval: 10,
            timeout: 5
        },
        retry: {
            attempts: 3,
            backoff: 'exponential'
        }
    },
    {
        name: 'content-service',
        url: 'http://content-service:3000',
        routes: ['/api/v1/content'],
        healthCheck: {
            path: '/health',
            interval: 10,
            timeout: 5
        },
        retry: {
            attempts: 3,
            backoff: 'exponential'
        }
    },
    {
        name: 'voice-service',
        url: 'http://voice-service:3000',
        routes: ['/api/v1/voice'],
        healthCheck: {
            path: '/health',
            interval: 10,
            timeout: 5
        },
        retry: {
            attempts: 3,
            backoff: 'exponential'
        }
    },
    {
        name: 'analytics-service',
        url: 'http://analytics-service:3000',
        routes: ['/api/v1/analytics'],
        healthCheck: {
            path: '/health',
            interval: 10,
            timeout: 5
        },
        retry: {
            attempts: 3,
            backoff: 'exponential'
        }
    }
];

/**
 * Creates Kong Gateway configuration with services, routes and plugins
 */
function createKongConfig(): KongConfig {
    return {
        serviceName: 'autonomous-revenue-platform',
        routePrefix: '/api/v1',
        port: Number(process.env.KONG_PORT) || 8000,
        host: process.env.KONG_HOST || 'localhost',
        services: API_SERVICES.map(service => ({
            ...service,
            plugins: configurePlugins(service)
        })),
        plugins: [
            {
                name: 'cors',
                enabled: true,
                config: {
                    origins: ['*'],
                    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
                    headers: ['Authorization', 'Content-Type', 'X-Correlation-ID'],
                    exposed_headers: ['X-RateLimit-Remaining', 'X-RateLimit-Reset'],
                    credentials: true,
                    max_age: 3600
                },
                priority: 1000,
                error: { handle: true }
            },
            {
                name: 'prometheus',
                enabled: true,
                config: {
                    status_codes: true,
                    latency: true,
                    bandwidth: true,
                    per_consumer: true
                },
                priority: 900,
                error: { handle: true }
            }
        ],
        redis: {
            host: process.env.REDIS_HOST,
            port: Number(process.env.REDIS_PORT),
            password: process.env.REDIS_PASSWORD,
            cluster: true,
            tls: process.env.NODE_ENV === 'production'
        },
        cache: {
            enabled: true,
            ttl: 300,
            strategy: 'memory',
            maxSize: '500mb'
        },
        monitoring: {
            datadog: {
                enabled: true,
                apiKey: process.env.DD_API_KEY,
                prefix: 'kong'
            },
            prometheus: {
                enabled: true,
                scrapeInterval: '10s'
            }
        },
        circuitBreaker: {
            enabled: true,
            threshold: 50,
            period: 10,
            timeout: 5,
            maxFails: 3
        }
    };
}

/**
 * Configures Kong plugins for security, performance and monitoring
 */
function configurePlugins(service: ServiceConfig): PluginConfig[] {
    return [
        {
            name: 'jwt',
            enabled: true,
            config: {
                secret_is_base64: true,
                claims_to_verify: ['exp', 'nbf'],
                key_claim_name: 'kid',
                maximum_expiration: 3600
            },
            priority: 1000,
            error: { handle: true }
        },
        {
            name: 'rate-limiting',
            enabled: true,
            config: {
                minute: DEFAULT_RATE_LIMIT.maxRequests,
                policy: 'redis',
                fault_tolerant: true,
                redis_host: DEFAULT_RATE_LIMIT.redis.host,
                redis_port: DEFAULT_RATE_LIMIT.redis.port,
                redis_password: DEFAULT_RATE_LIMIT.redis.password,
                redis_cluster: DEFAULT_RATE_LIMIT.redis.cluster
            },
            priority: 900,
            error: { handle: true }
        },
        {
            name: 'request-validator',
            enabled: true,
            config: {
                body_schema: service.name === 'campaign-service' ? 
                    require('../../openapi/schemas/campaign.yaml') : undefined,
                verbose_response: process.env.NODE_ENV !== 'production',
                version: 'draft4'
            },
            priority: 800,
            error: { handle: true }
        },
        {
            name: 'response-transformer',
            enabled: true,
            config: {
                add: {
                    headers: ['X-Content-Type-Options:nosniff', 'X-Frame-Options:DENY']
                }
            },
            priority: 700,
            error: { handle: true }
        },
        {
            name: 'correlation-id',
            enabled: true,
            config: {
                header_name: 'X-Correlation-ID',
                generator: 'uuid',
                echo_downstream: true
            },
            priority: 600,
            error: { handle: true }
        },
        {
            name: 'proxy-cache',
            enabled: true,
            config: {
                response_code: [200],
                request_method: ['GET'],
                content_type: ['application/json'],
                cache_ttl: 300,
                strategy: 'memory',
                memory: {
                    dictionary_name: 'kong_cache'
                }
            },
            priority: 500,
            error: { handle: true }
        }
    ];
}

// Export Kong configuration
export const kongConfig = createKongConfig();