// External dependencies
import { Request, Response, NextFunction, RequestHandler } from 'express'; // v4.18.0
import { OpenAPIValidator } from 'express-openapi-validator'; // v5.0.0
import { z } from 'zod'; // v3.22.0
import rateLimit from 'express-rate-limit'; // v6.7.0
import NodeCache from 'node-cache'; // v5.1.2
import { Counter, Histogram } from 'prom-client'; // v14.2.0

// Internal imports
import { 
  validateCampaign, 
  validateContent, 
  validateLead,
  ValidationError 
} from '../../../common/utils/validation';
import { CampaignSchema } from '../../openapi/schemas/campaign';

// Validation metrics
const validationLatency = new Histogram({
  name: 'api_validation_latency_seconds',
  help: 'Request validation latency in seconds',
  labelNames: ['endpoint', 'method']
});

const validationErrors = new Counter({
  name: 'api_validation_errors_total',
  help: 'Total validation errors',
  labelNames: ['type', 'endpoint']
});

// Validation cache
const validationCache = new NodeCache({
  stdTTL: 300, // 5 minutes
  checkperiod: 60
});

// Error messages
const VALIDATION_ERROR_MESSAGES = {
  INVALID_REQUEST: 'Invalid request data',
  SCHEMA_VALIDATION_FAILED: 'Request schema validation failed',
  BUSINESS_RULE_VIOLATION: 'Business rule validation failed',
  VALIDATION_TIMEOUT: 'Request validation timed out',
  RATE_LIMIT_EXCEEDED: 'Validation rate limit exceeded',
  SECURITY_VIOLATION: 'Security validation failed',
  COMPLIANCE_VIOLATION: 'Compliance validation failed'
} as const;

// Default validation options
const DEFAULT_VALIDATION_OPTIONS: IValidationOptions = {
  schemaPath: './openapi/schemas',
  validateResponses: true,
  validateRequests: true,
  enableCaching: true,
  cacheTTL: 300,
  rateLimit: {
    windowMs: 60000,
    max: 100
  },
  enableAuditLog: true,
  validationTimeout: 5000
};

// Validation options interface
export interface IValidationOptions {
  schemaPath: string;
  validateResponses: boolean;
  validateRequests: boolean;
  enableCaching: boolean;
  cacheTTL: number;
  rateLimit: {
    windowMs: number;
    max: number;
  };
  enableAuditLog: boolean;
  validationTimeout: number;
}

/**
 * Enhanced middleware factory for request validation with caching and rate limiting
 */
export function validateRequest(options: Partial<IValidationOptions> = {}): RequestHandler[] {
  const validationOptions = { ...DEFAULT_VALIDATION_OPTIONS, ...options };
  const middlewares: RequestHandler[] = [];

  // Rate limiting middleware
  if (validationOptions.rateLimit) {
    middlewares.push(
      rateLimit({
        windowMs: validationOptions.rateLimit.windowMs,
        max: validationOptions.rateLimit.max,
        message: { error: VALIDATION_ERROR_MESSAGES.RATE_LIMIT_EXCEEDED }
      })
    );
  }

  // OpenAPI validation middleware
  const openApiValidator = new OpenAPIValidator({
    apiSpec: validationOptions.schemaPath,
    validateRequests: validationOptions.validateRequests,
    validateResponses: validationOptions.validateResponses
  });
  middlewares.push(...openApiValidator.middleware());

  // Business rules validation middleware
  middlewares.push(async (req: Request, res: Response, next: NextFunction) => {
    const startTime = Date.now();
    const endpoint = `${req.method} ${req.path}`;
    const correlationId = req.headers['x-correlation-id'] as string;

    try {
      // Check cache if enabled
      if (validationOptions.enableCaching) {
        const cacheKey = `${correlationId}-${JSON.stringify(req.body)}`;
        const cachedResult = validationCache.get(cacheKey);
        if (cachedResult) {
          return next();
        }
      }

      // Validate with timeout
      const validationPromise = validateBusinessRules(req);
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error(VALIDATION_ERROR_MESSAGES.VALIDATION_TIMEOUT)), 
          validationOptions.validationTimeout
        );
      });

      await Promise.race([validationPromise, timeoutPromise]);

      // Cache successful validation
      if (validationOptions.enableCaching) {
        const cacheKey = `${correlationId}-${JSON.stringify(req.body)}`;
        validationCache.set(cacheKey, true, validationOptions.cacheTTL);
      }

      // Record validation latency
      const duration = (Date.now() - startTime) / 1000;
      validationLatency.labels(endpoint, req.method).observe(duration);

      next();
    } catch (error) {
      validationErrors.labels(error.name, endpoint).inc();

      if (validationOptions.enableAuditLog) {
        console.error('Validation Error:', {
          correlationId,
          endpoint,
          error: error.message,
          body: req.body,
          timestamp: new Date().toISOString()
        });
      }

      if (error instanceof ValidationError) {
        return res.status(400).json({
          error: error.message,
          details: error.errors,
          code: error.errorCode,
          correlationId
        });
      }

      return res.status(500).json({
        error: VALIDATION_ERROR_MESSAGES.INVALID_REQUEST,
        correlationId
      });
    }
  });

  return middlewares;
}

/**
 * Enhanced business rule validation with security checks
 */
async function validateBusinessRules(req: Request): Promise<void> {
  const { path, method, body } = req;

  // Determine validation type based on endpoint
  if (path.includes('/campaigns')) {
    await validateCampaign(body);
  } else if (path.includes('/content')) {
    await validateContent(body);
  } else if (path.includes('/leads')) {
    await validateLead(body);
  }

  // Additional security validations
  const securitySchema = z.object({
    organizationId: z.string().uuid(),
    // Add additional security fields as needed
  });

  try {
    await securitySchema.parseAsync(body);
  } catch (error) {
    throw new ValidationError(
      VALIDATION_ERROR_MESSAGES.SECURITY_VIOLATION,
      { security: [error.message] },
      'SEC_001'
    );
  }

  // Compliance validations for specific endpoints
  if (path.includes('/leads')) {
    const gdprSchema = z.object({
      gdprConsent: z.object({
        marketing: z.boolean(),
        dataProcessing: z.boolean(),
        consentDate: z.date()
      })
    });

    try {
      await gdprSchema.parseAsync(body);
    } catch (error) {
      throw new ValidationError(
        VALIDATION_ERROR_MESSAGES.COMPLIANCE_VIOLATION,
        { compliance: [error.message] },
        'COMP_001'
      );
    }
  }
}