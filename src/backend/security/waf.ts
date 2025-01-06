import { injectable } from 'inversify';
import { Request, Response, NextFunction } from 'express';
import { WAFV2Client, CreateWebACLCommand, UpdateWebACLCommand } from '@aws-sdk/client-wafv2';
import { SageMakerRuntimeClient, InvokeEndpointCommand } from '@aws-sdk/client-sagemaker-runtime';
import { RateLimiterRedis } from 'rate-limiter-flexible';
import Redis from 'ioredis';
import { CustomError, HTTP_STATUS, ERROR_CODES } from '../../common/middleware/error';
import { LoggingMiddleware } from '../../common/middleware/logging';
import { MetricType, MetricUnit } from '../../common/interfaces/metric.interface';

// External library versions
// @aws-sdk/client-wafv2: ^3.0.0
// @aws-sdk/client-sagemaker-runtime: ^3.0.0
// rate-limiter-flexible: ^2.4.1
// ioredis: ^5.3.2

export const WAF_ACTIONS = {
  ALLOW: 'ALLOW',
  BLOCK: 'BLOCK',
  COUNT: 'COUNT',
  CHALLENGE: 'CHALLENGE',
  RATE_LIMIT: 'RATE_LIMIT'
} as const;

export const ML_CONFIDENCE_THRESHOLD = 0.85;

export const RATE_LIMIT_DEFAULTS = {
  POINTS: 100,
  DURATION: 60,
  BLOCK_DURATION: 3600,
  DISTRIBUTED: true
} as const;

export interface IWAFConfig {
  rateLimit: {
    points: number;
    duration: number;
    blockDuration: number;
    distributed: boolean;
    bypassTokens: string[];
  };
  ipReputation: {
    enabled: boolean;
    threshold: number;
    cacheDuration: number;
  };
  mlDetection: {
    enabled: boolean;
    modelEndpoint: string;
    confidenceThreshold: number;
  };
  rules: WAFRule[];
  customRules: CustomWAFRule[];
}

interface WAFRule {
  id: string;
  name: string;
  priority: number;
  action: typeof WAF_ACTIONS[keyof typeof WAF_ACTIONS];
  conditions: WAFCondition[];
}

interface WAFCondition {
  field: string;
  operator: string;
  value: string | number | RegExp;
}

interface CustomWAFRule extends WAFRule {
  evaluator: (req: Request) => Promise<boolean>;
}

@injectable()
export class WAFService {
  private wafClient: WAFV2Client;
  private rateLimiter: RateLimiterRedis;
  private mlClient: SageMakerRuntimeClient;
  private redis: Redis;
  private ipReputationCache: Map<string, number>;

  constructor(
    private config: IWAFConfig,
    private logger: LoggingMiddleware
  ) {
    this.initializeWAF();
  }

  private async initializeWAF(): Promise<void> {
    // Initialize AWS WAF client
    this.wafClient = new WAFV2Client({
      region: process.env.AWS_REGION || 'us-west-2'
    });

    // Initialize Redis for distributed rate limiting
    this.redis = new Redis(process.env.REDIS_URL!, {
      enableOfflineQueue: false,
      maxRetriesPerRequest: 3
    });

    // Initialize rate limiter
    this.rateLimiter = new RateLimiterRedis({
      storeClient: this.redis,
      points: this.config.rateLimit.points,
      duration: this.config.rateLimit.duration,
      blockDuration: this.config.rateLimit.blockDuration,
      keyPrefix: 'waf_rl'
    });

    // Initialize ML client for threat detection
    this.mlClient = new SageMakerRuntimeClient({
      region: process.env.AWS_REGION || 'us-west-2'
    });

    this.ipReputationCache = new Map();
  }

  public applyWAFRules(): (req: Request, res: Response, next: NextFunction) => Promise<void> {
    return async (req: Request, res: Response, next: NextFunction) => {
      const clientIP = req.ip;
      const requestId = req.headers['x-request-id'] as string;

      try {
        // Check IP reputation if enabled
        if (this.config.ipReputation.enabled) {
          const reputationScore = await this.checkIPReputation(clientIP);
          if (reputationScore < this.config.ipReputation.threshold) {
            throw new CustomError(
              'Access denied due to IP reputation',
              HTTP_STATUS.FORBIDDEN,
              ERROR_CODES.SECURITY_ERROR
            );
          }
        }

        // Apply rate limiting
        if (!this.config.rateLimit.bypassTokens.includes(req.headers['x-bypass-token'] as string)) {
          await this.rateLimiter.consume(clientIP);
        }

        // Perform ML-based threat detection
        if (this.config.mlDetection.enabled) {
          const isThreat = await this.detectThreat(req);
          if (isThreat) {
            throw new CustomError(
              'Request blocked by ML threat detection',
              HTTP_STATUS.FORBIDDEN,
              ERROR_CODES.SECURITY_ERROR
            );
          }
        }

        // Apply WAF rules
        for (const rule of this.config.rules) {
          const ruleResult = await this.evaluateRule(rule, req);
          if (ruleResult === WAF_ACTIONS.BLOCK) {
            throw new CustomError(
              `Request blocked by WAF rule: ${rule.name}`,
              HTTP_STATUS.FORBIDDEN,
              ERROR_CODES.SECURITY_ERROR
            );
          }
        }

        // Apply custom rules
        for (const rule of this.config.customRules) {
          const ruleResult = await rule.evaluator(req);
          if (ruleResult) {
            throw new CustomError(
              `Request blocked by custom WAF rule: ${rule.name}`,
              HTTP_STATUS.FORBIDDEN,
              ERROR_CODES.SECURITY_ERROR
            );
          }
        }

        // Log successful request
        this.logger.logRequest();
        next();

      } catch (error) {
        // Log security event
        this.logger.logThreat({
          type: 'WAF_BLOCK',
          clientIP,
          requestId,
          reason: error.message,
          metadata: {
            path: req.path,
            method: req.method,
            headers: req.headers
          }
        });

        // Record metric
        this.logger.logMetric({
          id: requestId,
          name: 'waf.blocked_requests',
          type: MetricType.ERROR_RATE,
          value: 1,
          unit: MetricUnit.COUNT,
          service: 'waf',
          environment: process.env.NODE_ENV || 'development',
          metadata: {
            rule: error.message,
            clientIP
          },
          tags: {
            path: req.path,
            method: req.method
          }
        });

        next(error);
      }
    };
  }

  private async checkIPReputation(ip: string): Promise<number> {
    // Check cache first
    if (this.ipReputationCache.has(ip)) {
      return this.ipReputationCache.get(ip)!;
    }

    // Query IP reputation service
    try {
      const response = await fetch(`${process.env.IP_REPUTATION_API}/check/${ip}`);
      const data = await response.json();
      const score = data.score;

      // Cache the result
      this.ipReputationCache.set(ip, score);
      setTimeout(() => this.ipReputationCache.delete(ip), this.config.ipReputation.cacheDuration);

      return score;
    } catch (error) {
      console.error('IP reputation check failed:', error);
      return this.config.ipReputation.threshold + 1; // Allow request on API failure
    }
  }

  private async detectThreat(req: Request): Promise<boolean> {
    try {
      const input = this.prepareMLInput(req);
      const command = new InvokeEndpointCommand({
        EndpointName: this.config.mlDetection.modelEndpoint,
        ContentType: 'application/json',
        Body: JSON.stringify(input)
      });

      const response = await this.mlClient.send(command);
      const result = JSON.parse(new TextDecoder().decode(response.Body));

      return result.confidence > this.config.mlDetection.confidenceThreshold;
    } catch (error) {
      console.error('ML threat detection failed:', error);
      return false; // Allow request on ML service failure
    }
  }

  private async evaluateRule(rule: WAFRule, req: Request): Promise<string> {
    for (const condition of rule.conditions) {
      const value = this.extractFieldValue(condition.field, req);
      if (!this.evaluateCondition(condition, value)) {
        return WAF_ACTIONS.ALLOW;
      }
    }
    return rule.action;
  }

  private extractFieldValue(field: string, req: Request): string {
    const fieldParts = field.split('.');
    let value: any = req;
    for (const part of fieldParts) {
      value = value[part];
    }
    return value?.toString() || '';
  }

  private evaluateCondition(condition: WAFCondition, value: string): boolean {
    switch (condition.operator) {
      case 'equals':
        return value === condition.value.toString();
      case 'contains':
        return value.includes(condition.value.toString());
      case 'regex':
        return (condition.value as RegExp).test(value);
      case 'greaterThan':
        return parseFloat(value) > (condition.value as number);
      case 'lessThan':
        return parseFloat(value) < (condition.value as number);
      default:
        return false;
    }
  }

  private prepareMLInput(req: Request): object {
    return {
      headers: req.headers,
      method: req.method,
      path: req.path,
      query: req.query,
      body: req.body,
      ip: req.ip,
      timestamp: new Date().toISOString()
    };
  }
}