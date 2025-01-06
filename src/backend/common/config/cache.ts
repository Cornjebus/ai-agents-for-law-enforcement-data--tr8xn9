// Redis client library v5.3.0
import Redis, { RedisOptions, Cluster } from 'ioredis';
// Environment configuration v16.0.0
import { config } from 'dotenv';

// Load environment variables
config();

/**
 * Interface for SSL/TLS configuration
 */
interface SSLConfig {
  enabled: boolean;
  ca?: string;
  cert?: string;
  key?: string;
  rejectUnauthorized: boolean;
}

/**
 * Interface for Redis Sentinel configuration
 */
interface SentinelConfig {
  host: string;
  port: number;
}

/**
 * Interface for monitoring configuration
 */
interface MonitoringConfig {
  enabled: boolean;
  slowLogThreshold: number;
  metricsSampleRate: number;
  healthCheckInterval: number;
}

/**
 * Interface for backup configuration
 */
interface BackupConfig {
  enabled: boolean;
  schedule: string;
  retention: number;
  crossRegion: boolean;
}

/**
 * Comprehensive interface for Redis cache configuration
 */
interface CacheConfig {
  host: string;
  port: number;
  password: string;
  db: number;
  keyPrefix: string;
  cluster: boolean;
  nodes: string[];
  maxRetriesPerRequest: number;
  retryStrategy: (times: number) => number | null;
  connectTimeout: number;
  ttl: number;
  clusterRetryTimeout: number;
  maxConnections: number;
  commandTimeout: number;
  sentinels: SentinelConfig[];
  ssl: SSLConfig;
  monitoring: MonitoringConfig;
  backup: BackupConfig;
}

/**
 * Default cache configuration with comprehensive settings
 */
export const CACHE_CONFIG: CacheConfig = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379', 10),
  password: process.env.REDIS_PASSWORD || '',
  db: parseInt(process.env.REDIS_DB || '0', 10),
  keyPrefix: process.env.REDIS_KEY_PREFIX || 'arv:',
  cluster: process.env.REDIS_CLUSTER === 'true',
  nodes: (process.env.REDIS_NODES || '').split(',').filter(Boolean),
  maxRetriesPerRequest: 3,
  retryStrategy: (times: number) => {
    if (times > 3) return null;
    return Math.min(times * 200, 2000);
  },
  connectTimeout: 10000,
  ttl: parseInt(process.env.REDIS_TTL || '3600', 10),
  clusterRetryTimeout: 5000,
  maxConnections: parseInt(process.env.REDIS_MAX_CONNECTIONS || '50', 10),
  commandTimeout: 5000,
  sentinels: (process.env.REDIS_SENTINELS || '').split(',')
    .filter(Boolean)
    .map(sentinel => {
      const [host, port] = sentinel.split(':');
      return { host, port: parseInt(port, 10) };
    }),
  ssl: {
    enabled: process.env.REDIS_SSL === 'true',
    ca: process.env.REDIS_SSL_CA,
    cert: process.env.REDIS_SSL_CERT,
    key: process.env.REDIS_SSL_KEY,
    rejectUnauthorized: process.env.REDIS_SSL_REJECT_UNAUTHORIZED !== 'false'
  },
  monitoring: {
    enabled: process.env.REDIS_MONITORING === 'true',
    slowLogThreshold: parseInt(process.env.REDIS_SLOW_LOG_THRESHOLD || '100', 10),
    metricsSampleRate: parseInt(process.env.REDIS_METRICS_SAMPLE_RATE || '60', 10),
    healthCheckInterval: parseInt(process.env.REDIS_HEALTH_CHECK_INTERVAL || '5000', 10)
  },
  backup: {
    enabled: process.env.REDIS_BACKUP === 'true',
    schedule: process.env.REDIS_BACKUP_SCHEDULE || '0 0 * * *',
    retention: parseInt(process.env.REDIS_BACKUP_RETENTION || '7', 10),
    crossRegion: process.env.REDIS_BACKUP_CROSS_REGION === 'true'
  }
};

/**
 * Returns the default cache configuration with comprehensive settings
 */
export function getDefaultCacheConfig(): CacheConfig {
  return {
    ...CACHE_CONFIG,
    retryStrategy: (times: number) => {
      if (times > CACHE_CONFIG.maxRetriesPerRequest) return null;
      return Math.min(times * 200, CACHE_CONFIG.clusterRetryTimeout);
    }
  };
}

/**
 * Creates and configures a new Redis client instance with advanced options
 */
export function createCacheClient(options: RedisOptions = {}): Redis {
  const config = {
    ...getDefaultCacheConfig(),
    ...options
  };

  const client = config.cluster
    ? new Redis.Cluster(config.nodes, {
        redisOptions: {
          password: config.password,
          db: config.db,
          keyPrefix: config.keyPrefix,
          retryStrategy: config.retryStrategy,
          connectTimeout: config.connectTimeout,
          commandTimeout: config.commandTimeout,
          maxRetriesPerRequest: config.maxRetriesPerRequest,
          tls: config.ssl.enabled ? {
            ca: config.ssl.ca,
            cert: config.ssl.cert,
            key: config.ssl.key,
            rejectUnauthorized: config.ssl.rejectUnauthorized
          } : undefined
        },
        clusterRetryStrategy: config.retryStrategy,
        enableReadyCheck: true,
        maxRedirections: 3,
        retryDelayOnFailover: 1000
      })
    : new Redis({
        host: config.host,
        port: config.port,
        password: config.password,
        db: config.db,
        keyPrefix: config.keyPrefix,
        retryStrategy: config.retryStrategy,
        connectTimeout: config.connectTimeout,
        commandTimeout: config.commandTimeout,
        maxRetriesPerRequest: config.maxRetriesPerRequest,
        tls: config.ssl.enabled ? {
          ca: config.ssl.ca,
          cert: config.ssl.cert,
          key: config.ssl.key,
          rejectUnauthorized: config.ssl.rejectUnauthorized
        } : undefined,
        sentinels: config.sentinels.length > 0 ? config.sentinels : undefined,
        name: 'mymaster'
      });

  // Set up event handlers
  client.on('connect', () => {
    console.info('Redis client connected');
  });

  client.on('error', (err) => {
    console.error('Redis client error:', err);
  });

  client.on('close', () => {
    console.warn('Redis client connection closed');
  });

  // Set up monitoring if enabled
  if (config.monitoring.enabled) {
    client.config('SET', 'slowlog-log-slower-than', config.monitoring.slowLogThreshold);
    
    setInterval(() => {
      client.info('stats').then((stats) => {
        console.info('Redis stats:', stats);
      });
    }, config.monitoring.metricsSampleRate * 1000);

    setInterval(() => {
      client.ping().catch((err) => {
        console.error('Redis health check failed:', err);
      });
    }, config.monitoring.healthCheckInterval);
  }

  return client;
}