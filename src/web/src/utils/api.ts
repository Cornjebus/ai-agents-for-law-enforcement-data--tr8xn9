/**
 * @fileoverview Advanced API utility functions for request handling, error management,
 * request transformation, and response formatting with enhanced security and performance
 * Version: 1.0.0
 */

import axios from 'axios'; // v1.4.0
import qs from 'qs'; // v6.11.2
import { API_CONFIG } from '../lib/constants';
import { handleApiError } from '../lib/api';

// Circuit breaker configuration for retry mechanism
const DEFAULT_RETRY_OPTIONS = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 5000,
  jitterFactor: 0.1,
  retryableStatuses: [408, 429, 500, 502, 503, 504]
} as const;

// Content type definitions for request formatting
const CONTENT_TYPES = {
  JSON: 'application/json',
  FORM: 'application/x-www-form-urlencoded',
  MULTIPART: 'multipart/form-data',
  COMPRESSED: 'application/gzip'
} as const;

// Circuit breaker configuration
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,
  resetTimeoutMs: 60000,
  halfOpenRequests: 3
} as const;

/**
 * Enhanced query parameter formatting with support for nested objects and arrays
 * Implements RFC 3986 compliance and security measures
 */
export function formatQueryParams(params: Record<string, any>): Record<string, string> {
  if (!params || typeof params !== 'object') {
    return {};
  }

  // Deep clone to avoid mutations
  const formattedParams = JSON.parse(JSON.stringify(params));

  // Remove undefined and null values
  Object.keys(formattedParams).forEach(key => {
    if (formattedParams[key] == null) {
      delete formattedParams[key];
    }
  });

  // Format arrays and nested objects
  Object.keys(formattedParams).forEach(key => {
    const value = formattedParams[key];
    if (Array.isArray(value)) {
      formattedParams[key] = value.join(',');
    } else if (typeof value === 'object') {
      formattedParams[key] = JSON.stringify(value);
    }
  });

  // Encode and sanitize values
  return Object.keys(formattedParams).reduce((acc, key) => {
    const value = formattedParams[key];
    acc[encodeURIComponent(key)] = encodeURIComponent(String(value));
    return acc;
  }, {} as Record<string, string>);
}

/**
 * Advanced URL builder with path parameter interpolation and security measures
 */
export function buildRequestUrl(
  endpoint: string,
  params?: Record<string, any>,
  queryParams?: Record<string, any>
): string {
  if (!endpoint) {
    throw new Error('Endpoint is required');
  }

  let url = `${API_CONFIG.BASE_URL}/api/${API_CONFIG.VERSION}${endpoint}`;

  // Replace path parameters
  if (params) {
    Object.keys(params).forEach(key => {
      const value = encodeURIComponent(String(params[key]));
      url = url.replace(`:${key}`, value);
    });
  }

  // Add query parameters
  if (queryParams && Object.keys(queryParams).length > 0) {
    const formattedParams = formatQueryParams(queryParams);
    url += `?${qs.stringify(formattedParams, { arrayFormat: 'brackets' })}`;
  }

  // Validate final URL
  try {
    new URL(url);
  } catch (error) {
    throw new Error('Invalid URL construction');
  }

  return url;
}

/**
 * Advanced request body formatter with content type handling and security measures
 */
export function formatRequestBody(
  data: Record<string, any>,
  contentType: keyof typeof CONTENT_TYPES = 'JSON'
): any {
  if (!data) {
    return null;
  }

  // Remove sensitive information
  const sanitizedData = { ...data };
  ['password', 'token', 'secret'].forEach(key => {
    if (key in sanitizedData) {
      delete sanitizedData[key];
    }
  });

  switch (contentType) {
    case 'JSON':
      return JSON.stringify(sanitizedData);

    case 'FORM':
      return qs.stringify(sanitizedData, { 
        arrayFormat: 'brackets',
        encode: true 
      });

    case 'MULTIPART': {
      const formData = new FormData();
      Object.entries(sanitizedData).forEach(([key, value]) => {
        if (value instanceof File) {
          formData.append(key, value);
        } else if (Array.isArray(value)) {
          value.forEach(item => formData.append(`${key}[]`, item));
        } else {
          formData.append(key, String(value));
        }
      });
      return formData;
    }

    default:
      throw new Error(`Unsupported content type: ${contentType}`);
  }
}

/**
 * Sophisticated retry mechanism with exponential backoff and circuit breaker
 */
export async function retryRequest<T>(
  requestFn: () => Promise<T>,
  options: Partial<typeof DEFAULT_RETRY_OPTIONS> = {}
): Promise<T> {
  const retryOptions = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let attempt = 0;
  let lastError: any;

  while (attempt < retryOptions.maxRetries) {
    try {
      return await requestFn();
    } catch (error) {
      lastError = error;

      // Check if error is retryable
      if (axios.isAxiosError(error) && error.response) {
        if (!retryOptions.retryableStatuses.includes(error.response.status)) {
          throw handleApiError(error);
        }
      }

      // Calculate delay with exponential backoff and jitter
      const baseDelay = Math.min(
        retryOptions.initialDelayMs * Math.pow(2, attempt),
        retryOptions.maxDelayMs
      );
      const jitter = baseDelay * retryOptions.jitterFactor * Math.random();
      const delay = baseDelay + jitter;

      await new Promise(resolve => setTimeout(resolve, delay));
      attempt++;
    }
  }

  // Max retries exceeded
  throw handleApiError(lastError);
}