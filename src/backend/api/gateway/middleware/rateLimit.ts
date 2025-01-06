import { injectable } from 'inversify';
import { Request, Response, NextFunction } from 'express';
import { RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import Redis from 'redis';
import { createHash } from 'crypto';
import { CustomError, ERROR_CODES, ERROR_SEVERITY } from '../../../common/middleware/error';
import { LoggingMiddleware } from '../../../common/middleware/logging';
import { MetricType, MetricUnit } from '../../../common/interfaces/metric.interface';

// External library versions
// rate-limiter-flexible: ^2.4.0
// redis: ^4.6.0
// express: ^4.18.0

/**
 * Configuration interface for rate limiter
 */
interface RateLimitConfig {
  points: number;                // Maximum number of requests
  duration: number;             // Time window in seconds
  keyPrefix: string;            // Redis key prefix
  blockDuration: number;        // Duration to block if limit exceeded
  maxBlockDuration: number;     // Maximum block duration for repeat offenders
  enableSecurityEvents: boolean; // Enable security event tracking
  performanceThreshold: number; // Performance monitoring threshold (ms)
  redisConfig: {
    enableCluster: boolean;     // Enable Redis cluster mode
    retryStrategy: boolean;     // Enable retry strategy
  };
}

/**
 * Rate limit information interface
 */
interface RateLimitInfo {
  remainingPoints: number;
  resetTime: number;
  isBlocked: boolean;
  blockDuration?: number;
  blockReason?: string;
  securityMetadata?: Record<string, any>;
}

/**
 * Default rate limit configuration
 */
const DEFAULT_RATE_LIMIT_CONFIG: RateLimitConfig = {
  points: 100,
  duration: 60,
  keyPrefix: 'rl',
  blockDuration: 60,
  maxBlockDuration: 3600,
  enableSecurityEvents: true,
  performanceThreshold: 100,
  redisConfig: {
    enableCluster: true,
    retryStrategy: true
  }
};

/**
 * Rate limit response headers
 */
const RATE_LIMIT_HEADERS = {
  REMAINING: 'X-RateLimit-Remaining',
  RESET: 'X-RateLimit-Reset',
  LIMIT: 'X-RateLimit-Limit',
  BLOCK: 'X-RateLimit-Block',
  SECURITY: 'X-RateLimit-Security'
};

/**
 * Creates a Redis-based rate limiter instance
 */
function createRateLimiter(config: RateLimitConfig): RateLimiterRedis {
  const redisClient = Redis.createClient({
    enable_offline_queue: false,
    retry_strategy: config.redisConfig.retryStrategy ? 
      (options) => Math.min(options.attempt * 100, 3000) : undefined
  });

  return new RateLimiterRedis({
    storeClient: redisClient,
    points: config.points,
    duration: config.duration,
    keyPrefix: config.keyPrefix,
    blockDuration: config.blockDuration,
    insuranceLimiter: new RateLimiterRedis({
      storeClient: Redis.createClient(),
      points: 1,
      duration: 1
    })
  });
}

/**
 * Generates a unique rate limit key for the request
 */
function getRateLimitKey(req: Request): string {
  const identifier = req.user?.id || req.ip;
  const fingerprint = createHash('sha256')
    .update(`${req.headers['user-agent']}${req.headers['accept-language']}`)
    .digest('hex');
  
  return `${DEFAULT_RATE_LIMIT_CONFIG.keyPrefix}:${identifier}:${fingerprint}`;
}

/**
 * Advanced rate limiting middleware with security monitoring
 */
@injectable()
export class RateLimitMiddleware {
  private rateLimiter: RateLimiterRedis;
  private logger: LoggingMiddleware;
  private limitCache: Map<string, RateLimitInfo>;
  private blockList: Map<string, number>;

  constructor(
    private config: RateLimitConfig = DEFAULT_RATE_LIMIT_CONFIG,
    logger: LoggingMiddleware
  ) {
    this.rateLimiter = createRateLimiter(config);
    this.logger = logger;
    this.limitCache = new Map();
    this.blockList = new Map();
  }

  /**
   * Handles rate limiting for incoming requests
   */
  public async handleRateLimit(
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> {
    const startTime = process.hrtime();
    const key = getRateLimitKey(req);

    try {
      // Check if requester is blocked
      const blockExpiry = this.blockList.get(key);
      if (blockExpiry && blockExpiry > Date.now()) {
        throw new CustomError(
          'Too Many Requests - Blocked',
          429,
          ERROR_CODES.SECURITY_ERROR,
          undefined,
          ERROR_SEVERITY.HIGH
        );
      }

      // Consume point from rate limiter
      const rateLimitRes = await this.rateLimiter.consume(key);
      
      // Update rate limit headers
      this.updateRateLimitHeaders(res, rateLimitRes);
      
      // Track performance
      const [seconds, nanoseconds] = process.hrtime(startTime);
      const duration = seconds * 1000 + nanoseconds / 1000000;

      if (duration > this.config.performanceThreshold) {
        this.logger.logRequest()({
          type: MetricType.LATENCY,
          value: duration,
          unit: MetricUnit.MILLISECONDS,
          tags: {
            operation: 'rate_limit',
            endpoint: req.path
          }
        } as any, res, next);
      }

      // Cache rate limit info
      this.limitCache.set(key, {
        remainingPoints: rateLimitRes.remainingPoints,
        resetTime: rateLimitRes.msBeforeNext,
        isBlocked: false
      });

      next();
    } catch (error) {
      if (error instanceof Error) {
        const rateLimitError = error as any;
        
        // Handle rate limit exceeded
        if (rateLimitError.remainingPoints <= 0) {
          const blockDuration = this.calculateBlockDuration(key);
          this.blockList.set(key, Date.now() + blockDuration);

          // Log security event
          if (this.config.enableSecurityEvents) {
            this.logger.logRequest()({
              type: 'SECURITY_EVENT',
              severity: ERROR_SEVERITY.HIGH,
              message: 'Rate limit exceeded - Client blocked',
              metadata: {
                key,
                blockDuration,
                path: req.path,
                ip: req.ip
              }
            } as any, res, next);
          }

          res.setHeader(RATE_LIMIT_HEADERS.BLOCK, blockDuration.toString());
          res.setHeader(RATE_LIMIT_HEADERS.SECURITY, 'BLOCKED');

          throw new CustomError(
            'Too Many Requests',
            429,
            ERROR_CODES.SECURITY_ERROR,
            undefined,
            ERROR_SEVERITY.HIGH
          );
        }
      }
      
      next(error);
    }
  }

  /**
   * Updates rate limit headers on response
   */
  private updateRateLimitHeaders(res: Response, rateLimitRes: RateLimiterRes): void {
    res.setHeader(RATE_LIMIT_HEADERS.REMAINING, rateLimitRes.remainingPoints);
    res.setHeader(RATE_LIMIT_HEADERS.RESET, rateLimitRes.msBeforeNext);
    res.setHeader(RATE_LIMIT_HEADERS.LIMIT, this.config.points);
  }

  /**
   * Calculates progressive block duration for repeat offenders
   */
  private calculateBlockDuration(key: string): number {
    const violations = this.blockList.has(key) ? 
      (this.blockList.get(key) || 0) + 1 : 1;
    
    return Math.min(
      this.config.blockDuration * Math.pow(2, violations - 1),
      this.config.maxBlockDuration
    );
  }

  /**
   * Gets current rate limit information for a key
   */
  public getRateLimitInfo(key: string): RateLimitInfo | undefined {
    return this.limitCache.get(key);
  }
}

export { RateLimitMiddleware, RateLimitConfig, RateLimitInfo };