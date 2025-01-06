import { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import CircuitBreaker from 'circuit-breaker-js';
import { Logger } from './logging';

// External library versions
// express: ^4.18.0
// uuid: ^9.0.0
// circuit-breaker-js: ^0.0.1

// HTTP Status codes for standardized responses
export const HTTP_STATUS = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER: 500,
  SERVICE_UNAVAILABLE: 503,
  GATEWAY_TIMEOUT: 504
} as const;

// Error codes for categorization and tracking
export const ERROR_CODES = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  AUTH_ERROR: 'AUTH_ERROR',
  NOT_FOUND: 'NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  TRANSIENT_ERROR: 'TRANSIENT_ERROR',
  SECURITY_ERROR: 'SECURITY_ERROR',
  COMPLIANCE_ERROR: 'COMPLIANCE_ERROR'
} as const;

// Error severity levels for prioritization
export const ERROR_SEVERITY = {
  LOW: 'LOW',
  MEDIUM: 'MEDIUM',
  HIGH: 'HIGH',
  CRITICAL: 'CRITICAL'
} as const;

// PII patterns for data protection
const PII_PATTERNS = [
  /\b[\w\.-]+@[\w\.-]+\.\w{2,}\b/, // Email
  /\b\d{3}[-.]?\d{3}[-.]?\d{4}\b/, // Phone
  /\b\d{3}-\d{2}-\d{4}\b/, // SSN
  /\b(?:\d[ -]*?){13,16}\b/ // Credit Card
];

/**
 * Enhanced custom error class with tracking and security features
 */
export class CustomError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly correlationId: string;
  public readonly severity: typeof ERROR_SEVERITY[keyof typeof ERROR_SEVERITY];
  public readonly originalError?: Error;
  public readonly isTransient: boolean;
  public retryCount: number;

  constructor(
    message: string,
    statusCode: number = HTTP_STATUS.INTERNAL_SERVER,
    code: string = ERROR_CODES.INTERNAL_ERROR,
    correlationId: string = uuidv4(),
    severity: typeof ERROR_SEVERITY[keyof typeof ERROR_SEVERITY] = ERROR_SEVERITY.MEDIUM
  ) {
    super(message);
    
    // Validate status code range
    if (statusCode < 400 || statusCode > 599) {
      statusCode = HTTP_STATUS.INTERNAL_SERVER;
    }

    this.statusCode = statusCode;
    this.code = code;
    this.correlationId = correlationId;
    this.severity = severity;
    this.name = this.constructor.name;
    this.isTransient = this.determineIfTransient();
    this.retryCount = 0;

    // Capture stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  private determineIfTransient(): boolean {
    return [
      HTTP_STATUS.SERVICE_UNAVAILABLE,
      HTTP_STATUS.GATEWAY_TIMEOUT
    ].includes(this.statusCode);
  }
}

// Circuit breaker configuration for transient error handling
const circuitBreaker = new CircuitBreaker({
  windowDuration: 10000, // 10 seconds
  numBuckets: 10,
  timeoutDuration: 2000,
  errorThreshold: 50,
  volumeThreshold: 10
});

/**
 * Global error handling middleware
 */
export const errorHandler = (
  error: Error | CustomError,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const logger = new Logger();
  const correlationId = (error as CustomError).correlationId || req.headers['x-correlation-id'] || uuidv4();
  
  try {
    // Transform error to CustomError if needed
    const customError = error instanceof CustomError 
      ? error 
      : new CustomError(error.message);

    // Check for PII in error details
    const sanitizedMessage = sanitizeErrorMessage(customError.message);
    
    // Handle transient errors with circuit breaker
    if (customError.isTransient && customError.retryCount < 3) {
      handleTransientError(customError, req, res);
      return;
    }

    // Log error with security context
    logger.error('Error occurred', {
      correlationId,
      code: customError.code,
      statusCode: customError.statusCode,
      severity: customError.severity,
      message: sanitizedMessage,
      path: req.path,
      method: req.method,
      stack: process.env.NODE_ENV === 'development' ? customError.stack : undefined
    });

    // Record error metrics
    logger.metric({
      id: correlationId,
      name: 'error.occurrence',
      type: 'ERROR_RATE',
      value: 1,
      unit: 'COUNT',
      service: 'api',
      environment: process.env.NODE_ENV || 'development',
      metadata: {
        statusCode: customError.statusCode,
        code: customError.code,
        path: req.path
      },
      tags: {
        endpoint: req.path,
        method: req.method,
        errorType: customError.code
      }
    });

    // Trigger security event for critical errors
    if (customError.severity === ERROR_SEVERITY.CRITICAL) {
      logger.securityEvent({
        type: 'CRITICAL_ERROR',
        severity: 'HIGH',
        message: sanitizedMessage,
        correlationId,
        metadata: {
          path: req.path,
          method: req.method,
          ip: req.ip
        }
      });
    }

    // Prepare sanitized response
    const errorResponse = {
      error: {
        code: customError.code,
        message: sanitizedMessage,
        correlationId,
        ...(process.env.NODE_ENV === 'development' && { stack: customError.stack })
      }
    };

    // Set security headers
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Correlation-ID', correlationId);

    // Send error response
    res.status(customError.statusCode).json(errorResponse);
  } catch (handlingError) {
    // Fallback error handling
    logger.error('Error in error handler', {
      correlationId,
      originalError: error,
      handlingError
    });
    
    res.status(HTTP_STATUS.INTERNAL_SERVER).json({
      error: {
        code: ERROR_CODES.INTERNAL_ERROR,
        message: 'An unexpected error occurred',
        correlationId
      }
    });
  }
};

/**
 * Sanitizes error messages by removing PII
 */
function sanitizeErrorMessage(message: string): string {
  let sanitized = message;
  PII_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, '[REDACTED]');
  });
  return sanitized;
}

/**
 * Handles transient errors with retry logic
 */
function handleTransientError(error: CustomError, req: Request, res: Response): void {
  circuitBreaker.run(
    () => {
      error.retryCount++;
      // Retry the original request
      req.retry();
    },
    () => {
      // Circuit breaker is open, send error response
      res.status(HTTP_STATUS.SERVICE_UNAVAILABLE).json({
        error: {
          code: ERROR_CODES.TRANSIENT_ERROR,
          message: 'Service temporarily unavailable',
          correlationId: error.correlationId
        }
      });
    }
  );
}