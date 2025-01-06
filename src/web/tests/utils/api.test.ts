/**
 * @fileoverview Comprehensive test suite for API utility functions
 * Version: 1.0.0
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals'; // v29.5.0
import axios from 'axios'; // v1.4.0
import MockAdapter from 'axios-mock-adapter'; // v1.21.4
import { formatQueryParams, buildRequestUrl, formatRequestBody, retryRequest } from '../../src/utils/api';
import { API_CONFIG } from '../../src/lib/constants';

// Test constants
const MOCK_BASE_URL = 'https://api.example.com';
const TEST_TIMEOUT = 10000;
const RETRY_CONFIG = {
  maxRetries: 3,
  backoffFactor: 2,
  circuitBreakerThreshold: 5
};
const COMPRESSION_THRESHOLD = 1024;

// Mock axios instance
let mockAxios: MockAdapter;

beforeEach(() => {
  mockAxios = new MockAdapter(axios);
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  mockAxios.restore();
  jest.clearAllMocks();
});

describe('formatQueryParams', () => {
  it('should format nested objects correctly', () => {
    const params = {
      filter: { status: 'active', type: 'campaign' },
      sort: { field: 'createdAt', order: 'desc' }
    };
    const formatted = formatQueryParams(params);
    expect(formatted).toHaveProperty('filter');
    expect(formatted).toHaveProperty('sort');
    expect(JSON.parse(decodeURIComponent(formatted.filter))).toEqual(params.filter);
  });

  it('should handle array parameters', () => {
    const params = {
      ids: [1, 2, 3],
      tags: ['marketing', 'sales']
    };
    const formatted = formatQueryParams(params);
    expect(formatted.ids).toBe('1,2,3');
    expect(formatted.tags).toBe('marketing,sales');
  });

  it('should properly encode special characters', () => {
    const params = {
      query: 'test&query=value',
      path: '/unsafe/path/'
    };
    const formatted = formatQueryParams(params);
    expect(formatted.query).not.toContain('&');
    expect(formatted.path).not.toContain('/');
  });

  it('should remove undefined and null values', () => {
    const params = {
      valid: 'value',
      nullValue: null,
      undefinedValue: undefined
    };
    const formatted = formatQueryParams(params);
    expect(formatted).toHaveProperty('valid');
    expect(formatted).not.toHaveProperty('nullValue');
    expect(formatted).not.toHaveProperty('undefinedValue');
  });
});

describe('buildRequestUrl', () => {
  it('should build URL with path parameters', () => {
    const endpoint = '/campaigns/:id/metrics';
    const params = { id: '123' };
    const url = buildRequestUrl(endpoint, params);
    expect(url).toContain('/campaigns/123/metrics');
    expect(url).toContain(API_CONFIG.VERSION);
  });

  it('should handle query parameters correctly', () => {
    const endpoint = '/leads';
    const queryParams = {
      page: 1,
      limit: 10,
      sort: 'createdAt'
    };
    const url = buildRequestUrl(endpoint, undefined, queryParams);
    expect(url).toContain('?');
    expect(url).toContain('page=1');
    expect(url).toContain('limit=10');
    expect(url).toContain('sort=createdAt');
  });

  it('should validate and sanitize URLs', () => {
    const endpoint = '/content/<script>alert("xss")</script>';
    expect(() => buildRequestUrl(endpoint)).toThrow('Invalid URL construction');
  });

  it('should handle empty parameters gracefully', () => {
    const endpoint = '/analytics';
    const url = buildRequestUrl(endpoint);
    expect(url).toBe(`${API_CONFIG.BASE_URL}/api/${API_CONFIG.VERSION}${endpoint}`);
  });
});

describe('formatRequestBody', () => {
  it('should format JSON content type correctly', () => {
    const data = {
      name: 'Test Campaign',
      budget: 1000,
      settings: { automated: true }
    };
    const formatted = formatRequestBody(data, 'JSON');
    expect(JSON.parse(formatted)).toEqual(data);
  });

  it('should handle form data with files', () => {
    const file = new File(['test'], 'test.txt', { type: 'text/plain' });
    const data = {
      title: 'Test Upload',
      file
    };
    const formatted = formatRequestBody(data, 'MULTIPART');
    expect(formatted instanceof FormData).toBe(true);
    expect(formatted.get('title')).toBe('Test Upload');
    expect(formatted.get('file')).toBe(file);
  });

  it('should remove sensitive information', () => {
    const data = {
      username: 'test',
      password: 'secret',
      token: 'sensitive'
    };
    const formatted = JSON.parse(formatRequestBody(data, 'JSON'));
    expect(formatted).toHaveProperty('username');
    expect(formatted).not.toHaveProperty('password');
    expect(formatted).not.toHaveProperty('token');
  });

  it('should handle array values in form data', () => {
    const data = {
      tags: ['tag1', 'tag2'],
      categories: ['cat1', 'cat2']
    };
    const formatted = formatRequestBody(data, 'FORM');
    expect(formatted).toContain('tags[]=tag1');
    expect(formatted).toContain('tags[]=tag2');
  });
});

describe('retryRequest', () => {
  it('should retry failed requests with exponential backoff', async () => {
    const endpoint = '/test';
    mockAxios
      .onGet(endpoint)
      .replyOnce(503)
      .onGet(endpoint)
      .replyOnce(503)
      .onGet(endpoint)
      .reply(200, { success: true });

    const result = await retryRequest(
      () => axios.get(endpoint),
      { maxRetries: 3 }
    );

    expect(result.data).toEqual({ success: true });
  }, TEST_TIMEOUT);

  it('should handle circuit breaker threshold', async () => {
    const endpoint = '/test';
    mockAxios.onGet(endpoint).reply(503);

    let errorCount = 0;
    try {
      await retryRequest(
        () => {
          errorCount++;
          return axios.get(endpoint);
        },
        { maxRetries: RETRY_CONFIG.maxRetries }
      );
    } catch (error) {
      expect(errorCount).toBeLessThanOrEqual(RETRY_CONFIG.circuitBreakerThreshold);
    }
  });

  it('should not retry on non-retryable errors', async () => {
    const endpoint = '/test';
    mockAxios.onGet(endpoint).reply(400);

    try {
      await retryRequest(() => axios.get(endpoint));
    } catch (error) {
      expect(axios.isAxiosError(error)).toBe(true);
      expect(error.response?.status).toBe(400);
    }
  });

  it('should respect max retry attempts', async () => {
    const endpoint = '/test';
    mockAxios.onGet(endpoint).reply(503);

    let attempts = 0;
    try {
      await retryRequest(
        () => {
          attempts++;
          return axios.get(endpoint);
        },
        { maxRetries: 3 }
      );
    } catch (error) {
      expect(attempts).toBe(3);
    }
  });
});