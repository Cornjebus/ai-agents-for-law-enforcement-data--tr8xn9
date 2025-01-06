import request from 'supertest'; // v6.3.3
import { describe, beforeAll, afterAll, beforeEach, test, expect } from '@jest/globals'; // v29.7.0
import Redis from 'ioredis'; // v5.3.2
import { app } from '../../api/gateway/index';
import { CustomError } from '../../common/middleware/error';
import { validateRequest } from '../../api/gateway/middleware/validation';

// Test constants
const TEST_TIMEOUT = 30000;
const API_VERSION = 'v1';
const TEST_USER = {
  id: 'test-user-id',
  email: 'test@example.com',
  role: 'admin'
};
const RATE_LIMIT_CONFIG = {
  window: 60,
  max_requests: 100,
  block_duration: 300
};
const PERFORMANCE_THRESHOLDS = {
  p95_latency: 100,
  max_latency: 200,
  error_rate: 0.01
};

// Test data
const testCampaign = {
  name: "Test Campaign",
  type: "OUTBOUND_CALL",
  status: "DRAFT",
  configuration: {
    channels: ["VOICE"],
    content: [{
      type: "TEXT",
      platform: "VOICE",
      content: "Test content",
      schedule: {
        startTime: new Date().toISOString(),
        frequency: "daily",
        timezone: "UTC"
      }
    }],
    schedule: {
      timezone: "UTC",
      activeHours: {
        start: "09:00",
        end: "17:00",
        days: [1, 2, 3, 4, 5]
      }
    }
  },
  startDate: new Date().toISOString()
};

// Redis client for rate limit testing
let redisClient: Redis;

/**
 * Sets up test environment with database, Redis, and test data
 */
async function setupTestServer(): Promise<void> {
  // Initialize Redis
  redisClient = new Redis({
    host: process.env.REDIS_HOST || 'localhost',
    port: Number(process.env.REDIS_PORT) || 6379,
    enableOfflineQueue: false
  });

  // Clear rate limit data
  await redisClient.flushall();

  // Generate test tokens
  const testToken = await generateTestToken(TEST_USER);
  process.env.TEST_TOKEN = testToken;
}

/**
 * Cleans up test resources
 */
async function cleanupTestServer(): Promise<void> {
  await redisClient.quit();
}

/**
 * Helper to generate test JWT tokens
 */
async function generateTestToken(user: any): Promise<string> {
  return `Bearer test-token-${user.id}`;
}

describe('API Integration Tests', () => {
  beforeAll(async () => {
    await setupTestServer();
  }, TEST_TIMEOUT);

  afterAll(async () => {
    await cleanupTestServer();
  });

  beforeEach(async () => {
    await redisClient.flushall();
  });

  describe('Campaign Endpoints', () => {
    test('should create campaign with valid data', async () => {
      const response = await request(app)
        .post(`/api/${API_VERSION}/campaigns`)
        .set('Authorization', process.env.TEST_TOKEN!)
        .send(testCampaign);

      expect(response.status).toBe(201);
      expect(response.body).toHaveProperty('id');
      expect(response.headers['x-correlation-id']).toBeDefined();
    });

    test('should enforce rate limits on campaign creation', async () => {
      const requests = Array(RATE_LIMIT_CONFIG.max_requests + 1)
        .fill(null)
        .map(() => 
          request(app)
            .post(`/api/${API_VERSION}/campaigns`)
            .set('Authorization', process.env.TEST_TOKEN!)
            .send(testCampaign)
        );

      const responses = await Promise.all(requests);
      const blockedRequests = responses.filter(r => r.status === 429);
      expect(blockedRequests.length).toBeGreaterThan(0);
    });

    test('should validate campaign schema', async () => {
      const invalidCampaign = { ...testCampaign, name: '' };
      const response = await request(app)
        .post(`/api/${API_VERSION}/campaigns`)
        .set('Authorization', process.env.TEST_TOKEN!)
        .send(invalidCampaign);

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });
  });

  describe('Authentication Middleware', () => {
    test('should reject requests without token', async () => {
      const response = await request(app)
        .get(`/api/${API_VERSION}/campaigns`);

      expect(response.status).toBe(401);
    });

    test('should validate token format', async () => {
      const response = await request(app)
        .get(`/api/${API_VERSION}/campaigns`)
        .set('Authorization', 'invalid-token');

      expect(response.status).toBe(401);
    });

    test('should enforce role-based access', async () => {
      const restrictedToken = await generateTestToken({ ...TEST_USER, role: 'guest' });
      const response = await request(app)
        .post(`/api/${API_VERSION}/campaigns`)
        .set('Authorization', restrictedToken)
        .send(testCampaign);

      expect(response.status).toBe(403);
    });
  });

  describe('Performance Tests', () => {
    test('should maintain API response times within thresholds', async () => {
      const startTime = Date.now();
      const response = await request(app)
        .get(`/api/${API_VERSION}/campaigns`)
        .set('Authorization', process.env.TEST_TOKEN!);

      const latency = Date.now() - startTime;
      expect(latency).toBeLessThan(PERFORMANCE_THRESHOLDS.max_latency);
      expect(response.status).toBe(200);
    });

    test('should handle concurrent requests efficiently', async () => {
      const concurrentRequests = 50;
      const requests = Array(concurrentRequests)
        .fill(null)
        .map(() => 
          request(app)
            .get(`/api/${API_VERSION}/campaigns`)
            .set('Authorization', process.env.TEST_TOKEN!)
        );

      const startTime = Date.now();
      const responses = await Promise.all(requests);
      const totalTime = Date.now() - startTime;

      const successfulRequests = responses.filter(r => r.status === 200);
      expect(successfulRequests.length).toBe(concurrentRequests);
      expect(totalTime / concurrentRequests).toBeLessThan(PERFORMANCE_THRESHOLDS.p95_latency);
    });
  });

  describe('Error Handling', () => {
    test('should handle validation errors gracefully', async () => {
      const response = await request(app)
        .post(`/api/${API_VERSION}/campaigns`)
        .set('Authorization', process.env.TEST_TOKEN!)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
      expect(response.body.error.code).toBeDefined();
    });

    test('should handle rate limit errors with correct headers', async () => {
      const requests = Array(RATE_LIMIT_CONFIG.max_requests + 1)
        .fill(null)
        .map(() => 
          request(app)
            .get(`/api/${API_VERSION}/campaigns`)
            .set('Authorization', process.env.TEST_TOKEN!)
        );

      const responses = await Promise.all(requests);
      const blockedResponse = responses.find(r => r.status === 429);
      
      expect(blockedResponse?.headers['x-ratelimit-reset']).toBeDefined();
      expect(blockedResponse?.headers['x-ratelimit-remaining']).toBe('0');
    });
  });

  describe('Security Headers', () => {
    test('should set security headers on all responses', async () => {
      const response = await request(app)
        .get(`/api/${API_VERSION}/campaigns`)
        .set('Authorization', process.env.TEST_TOKEN!);

      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
      expect(response.headers['x-xss-protection']).toBe('1; mode=block');
    });
  });
});