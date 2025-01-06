import { Queue, QueueOptions } from 'bull'; // v4.10.0
import { config } from 'dotenv'; // v16.0.0
import { DatabaseConfig } from './database';

// Load environment variables
config();

/**
 * Interface for Redis cluster configuration options
 */
interface RedisClusterOptions {
  nodes: Array<{ host: string; port: number }>;
  options: {
    maxRedirections: number;
    retryDelayOnFailover: number;
    retryDelayOnClusterDown: number;
  };
}

/**
 * Interface for Redis sentinel configuration options
 */
interface RedisSentinelOptions {
  sentinels: Array<{ host: string; port: number }>;
  name: string;
  password: string;
}

/**
 * Interface for queue alert threshold configuration
 */
interface QueueAlertThresholds {
  waitingJobsCount: number;
  stalledJobsCount: number;
  delayedJobsCount: number;
  processingTime: number;
}

/**
 * Interface for queue health check options
 */
interface HealthCheckOptions {
  interval: number;
  timeout: number;
  maxMemoryUsage: number;
  maxCPUUsage: number;
}

/**
 * Comprehensive interface for queue configuration
 */
export interface QueueConfig {
  redis: {
    host: string;
    port: number;
    password: string;
    tls: boolean;
    cluster?: RedisClusterOptions;
    sentinel?: RedisSentinelOptions;
  };
  prefix: string;
  defaultJobOptions: {
    attempts: number;
    backoff: {
      type: string;
      delay: number;
    };
    removeOnComplete: boolean;
    removeOnFail: boolean;
    priority: number;
    timeout: number;
  };
  settings: {
    maxStalledCount: number;
    stalledInterval: number;
    maxConcurrency: number;
    lockDuration: number;
    lockRenewTime: number;
    retryProcessDelay: number;
  };
  monitoring: {
    metrics: boolean;
    alertThresholds: QueueAlertThresholds;
    healthCheck: HealthCheckOptions;
  };
}

// Constants for queue configuration
export const DEFAULT_RETRY_ATTEMPTS = 3;
export const MAX_CONCURRENCY = 50;

/**
 * Default queue configuration with comprehensive settings
 */
export const QUEUE_CONFIG: QueueConfig = {
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    tls: process.env.REDIS_TLS === 'true',
    cluster: process.env.REDIS_CLUSTER === 'true' ? {
      nodes: (process.env.REDIS_CLUSTER_NODES || '')
        .split(',')
        .map(node => {
          const [host, port] = node.split(':');
          return { host, port: parseInt(port, 10) };
        }),
      options: {
        maxRedirections: parseInt(process.env.REDIS_MAX_REDIRECTIONS || '16', 10),
        retryDelayOnFailover: parseInt(process.env.REDIS_RETRY_DELAY_FAILOVER || '100', 10),
        retryDelayOnClusterDown: parseInt(process.env.REDIS_RETRY_DELAY_DOWN || '1000', 10)
      }
    } : undefined,
    sentinel: process.env.REDIS_SENTINEL === 'true' ? {
      sentinels: (process.env.REDIS_SENTINEL_NODES || '')
        .split(',')
        .map(node => {
          const [host, port] = node.split(':');
          return { host, port: parseInt(port, 10) };
        }),
      name: process.env.REDIS_SENTINEL_NAME || 'master',
      password: process.env.REDIS_SENTINEL_PASSWORD || ''
    } : undefined
  },
  prefix: process.env.QUEUE_PREFIX || 'revenue-platform',
  defaultJobOptions: {
    attempts: DEFAULT_RETRY_ATTEMPTS,
    backoff: {
      type: 'exponential',
      delay: 1000
    },
    removeOnComplete: true,
    removeOnFail: false,
    priority: 0,
    timeout: 5000
  },
  settings: {
    maxStalledCount: parseInt(process.env.QUEUE_MAX_STALLED || '3', 10),
    stalledInterval: parseInt(process.env.QUEUE_STALLED_INTERVAL || '30000', 10),
    maxConcurrency: parseInt(process.env.QUEUE_MAX_CONCURRENCY || String(MAX_CONCURRENCY), 10),
    lockDuration: parseInt(process.env.QUEUE_LOCK_DURATION || '30000', 10),
    lockRenewTime: parseInt(process.env.QUEUE_LOCK_RENEW_TIME || '15000', 10),
    retryProcessDelay: parseInt(process.env.QUEUE_RETRY_DELAY || '5000', 10)
  },
  monitoring: {
    metrics: process.env.QUEUE_METRICS !== 'false',
    alertThresholds: {
      waitingJobsCount: parseInt(process.env.QUEUE_ALERT_WAITING || '1000', 10),
      stalledJobsCount: parseInt(process.env.QUEUE_ALERT_STALLED || '50', 10),
      delayedJobsCount: parseInt(process.env.QUEUE_ALERT_DELAYED || '500', 10),
      processingTime: parseInt(process.env.QUEUE_ALERT_PROCESSING_TIME || '10000', 10)
    },
    healthCheck: {
      interval: parseInt(process.env.QUEUE_HEALTH_INTERVAL || '60000', 10),
      timeout: parseInt(process.env.QUEUE_HEALTH_TIMEOUT || '5000', 10),
      maxMemoryUsage: parseInt(process.env.QUEUE_MAX_MEMORY || '1024', 10),
      maxCPUUsage: parseInt(process.env.QUEUE_MAX_CPU || '80', 10)
    }
  }
};

/**
 * Returns the default queue configuration with environment-specific optimizations
 */
export function getDefaultQueueConfig(): QueueConfig {
  return { ...QUEUE_CONFIG };
}

/**
 * Creates and configures a new Bull queue instance with comprehensive error handling and monitoring
 * @param name Queue name
 * @param options Optional queue configuration override
 * @returns Configured Bull queue instance
 */
export function createQueue(name: string, options: Partial<QueueConfig> = {}): Queue {
  const queueConfig = {
    ...QUEUE_CONFIG,
    ...options
  };

  const queueOptions: QueueOptions = {
    redis: queueConfig.redis,
    prefix: queueConfig.prefix,
    defaultJobOptions: queueConfig.defaultJobOptions,
    settings: queueConfig.settings
  };

  const queue = new Queue(name, queueOptions);

  // Set up error handling
  queue.on('error', (error) => {
    console.error(`Queue ${name} error:`, error);
  });

  // Set up stalled job handling
  queue.on('stalled', (job) => {
    console.warn(`Job ${job.id} in queue ${name} has stalled`);
  });

  // Set up monitoring if enabled
  if (queueConfig.monitoring.metrics) {
    queue.on('completed', (job) => {
      const processingTime = Date.now() - job.timestamp;
      if (processingTime > queueConfig.monitoring.alertThresholds.processingTime) {
        console.warn(`Job ${job.id} in queue ${name} exceeded processing time threshold`);
      }
    });

    // Set up health check monitoring
    setInterval(async () => {
      try {
        const jobCounts = await queue.getJobCounts();
        
        if (jobCounts.waiting > queueConfig.monitoring.alertThresholds.waitingJobsCount) {
          console.warn(`Queue ${name} has excessive waiting jobs: ${jobCounts.waiting}`);
        }
        
        if (jobCounts.delayed > queueConfig.monitoring.alertThresholds.delayedJobsCount) {
          console.warn(`Queue ${name} has excessive delayed jobs: ${jobCounts.delayed}`);
        }
      } catch (error) {
        console.error(`Health check failed for queue ${name}:`, error);
      }
    }, queueConfig.monitoring.healthCheck.interval);
  }

  return queue;
}