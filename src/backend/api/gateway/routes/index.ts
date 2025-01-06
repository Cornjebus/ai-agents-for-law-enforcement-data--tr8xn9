import express, { Router } from 'express'; // v4.18.0
import cors from 'cors'; // v2.8.5
import helmet from 'helmet'; // v7.0.0
import compression from 'compression'; // v1.7.4
import promMiddleware from 'express-prometheus-middleware'; // v1.2.0

import { 
  authenticate, 
  validateToken, 
  verifyMFA 
} from '../middleware/auth';
import { 
  validateRequest, 
  validateBusinessRules, 
  sanitizeRequest 
} from '../middleware/validation';
import { 
  RateLimitMiddleware,
  RateLimitConfig 
} from '../middleware/rateLimit';

// Constants for API configuration
const API_VERSION = 'v1';
const BASE_PATH = `/api/${API_VERSION}`;

// Enhanced rate limiting configuration
const RATE_LIMIT_CONFIG: RateLimitConfig = {
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

// Security configuration
const SECURITY_CONFIG = {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || [],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-API-Key'],
    exposedHeaders: ['X-RateLimit-Limit', 'X-RateLimit-Remaining'],
    credentials: true,
    maxAge: 86400
  },
  helmet: {
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
  }
};

// Monitoring configuration
const MONITORING_CONFIG = {
  metrics: {
    metricsPath: '/metrics',
    collectDefaultMetrics: true,
    requestDurationBuckets: [0.1, 0.5, 1, 1.5, 2, 3, 5, 10],
    requestLengthBuckets: [512, 1024, 5120, 10240, 51200, 102400],
    responseLengthBuckets: [512, 1024, 5120, 10240, 51200, 102400]
  }
};

// Initialize router
const router = Router();

// Configure global middleware
router.use(cors(SECURITY_CONFIG.cors));
router.use(helmet(SECURITY_CONFIG.helmet));
router.use(compression());
router.use(express.json({ limit: '10mb' }));
router.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Configure monitoring
router.use(promMiddleware(MONITORING_CONFIG.metrics));

// Initialize rate limiter
const rateLimiter = new RateLimitMiddleware(RATE_LIMIT_CONFIG);

/**
 * Configure campaign routes with comprehensive security and validation
 */
function setupCampaignRoutes(router: Router): void {
  const campaignPath = `${BASE_PATH}/campaigns`;
  const campaignAuth = authenticate({ roles: ['ADMIN', 'MANAGER'] });
  const campaignValidation = validateRequest();

  router.post(campaignPath,
    rateLimiter.handleRateLimit,
    campaignAuth,
    campaignValidation,
    async (req, res, next) => {
      // Campaign creation endpoint implementation
    }
  );

  router.get(campaignPath,
    rateLimiter.handleRateLimit,
    campaignAuth,
    async (req, res, next) => {
      // Campaign listing endpoint implementation
    }
  );

  router.get(`${campaignPath}/:id`,
    rateLimiter.handleRateLimit,
    campaignAuth,
    async (req, res, next) => {
      // Campaign detail endpoint implementation
    }
  );

  router.put(`${campaignPath}/:id`,
    rateLimiter.handleRateLimit,
    campaignAuth,
    campaignValidation,
    async (req, res, next) => {
      // Campaign update endpoint implementation
    }
  );

  router.delete(`${campaignPath}/:id`,
    rateLimiter.handleRateLimit,
    campaignAuth,
    async (req, res, next) => {
      // Campaign deletion endpoint implementation
    }
  );
}

/**
 * Configure content routes with enhanced security
 */
function setupContentRoutes(router: Router): void {
  const contentPath = `${BASE_PATH}/content`;
  const contentAuth = authenticate({ roles: ['ADMIN', 'CONTENT_CREATOR'] });
  const contentValidation = validateRequest();

  router.post(contentPath,
    rateLimiter.handleRateLimit,
    contentAuth,
    contentValidation,
    async (req, res, next) => {
      // Content creation endpoint implementation
    }
  );

  router.get(contentPath,
    rateLimiter.handleRateLimit,
    contentAuth,
    async (req, res, next) => {
      // Content listing endpoint implementation
    }
  );

  router.get(`${contentPath}/:id`,
    rateLimiter.handleRateLimit,
    contentAuth,
    async (req, res, next) => {
      // Content detail endpoint implementation
    }
  );

  router.put(`${contentPath}/:id`,
    rateLimiter.handleRateLimit,
    contentAuth,
    contentValidation,
    async (req, res, next) => {
      // Content update endpoint implementation
    }
  );
}

/**
 * Configure lead routes with PII protection
 */
function setupLeadRoutes(router: Router): void {
  const leadPath = `${BASE_PATH}/leads`;
  const leadAuth = authenticate({ roles: ['ADMIN', 'MANAGER', 'ANALYST'] });
  const leadValidation = validateRequest();

  router.post(leadPath,
    rateLimiter.handleRateLimit,
    leadAuth,
    leadValidation,
    async (req, res, next) => {
      // Lead creation endpoint implementation
    }
  );

  router.get(leadPath,
    rateLimiter.handleRateLimit,
    leadAuth,
    async (req, res, next) => {
      // Lead listing endpoint implementation
    }
  );

  router.get(`${leadPath}/:id`,
    rateLimiter.handleRateLimit,
    leadAuth,
    async (req, res, next) => {
      // Lead detail endpoint implementation
    }
  );

  router.put(`${leadPath}/:id`,
    rateLimiter.handleRateLimit,
    leadAuth,
    leadValidation,
    async (req, res, next) => {
      // Lead update endpoint implementation
    }
  );
}

/**
 * Configure analytics routes with metrics
 */
function setupAnalyticsRoutes(router: Router): void {
  const analyticsPath = `${BASE_PATH}/analytics`;
  const analyticsAuth = authenticate({ roles: ['ADMIN', 'ANALYST'] });

  router.get(`${analyticsPath}/metrics`,
    rateLimiter.handleRateLimit,
    analyticsAuth,
    async (req, res, next) => {
      // Analytics metrics endpoint implementation
    }
  );

  router.get(`${analyticsPath}/reports`,
    rateLimiter.handleRateLimit,
    analyticsAuth,
    async (req, res, next) => {
      // Analytics reports endpoint implementation
    }
  );
}

// Configure all routes
setupCampaignRoutes(router);
setupContentRoutes(router);
setupLeadRoutes(router);
setupAnalyticsRoutes(router);

// Error handling middleware
router.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('API Error:', err);
  res.status(err.status || 500).json({
    error: {
      message: err.message || 'Internal Server Error',
      code: err.code || 'INTERNAL_ERROR',
      correlationId: req.headers['x-correlation-id']
    }
  });
});

export default router;