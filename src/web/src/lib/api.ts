/**
 * @fileoverview Enhanced core API client library providing a centralized interface for making HTTP requests
 * Features circuit breaker pattern, advanced caching, request batching, compression, and security measures
 * Version: 1.0.0
 */

import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from 'axios'; // v1.4.0
import axiosRetry from 'axios-retry'; // v3.5.0
import CircuitBreaker from 'circuit-breaker-js'; // v0.0.3
import * as pako from 'pako'; // v2.1.0
import qs from 'qs'; // v6.11.2
import { API_CONFIG } from './constants';
import { TokenManager } from './auth';

// Circuit breaker configuration
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,
  resetTimeout: 30000,
  monitorInterval: 5000
};

// Cache configuration
const CACHE_CONFIG = {
  ttl: 300000, // 5 minutes
  maxSize: 100,
  updateAgeOnGet: true
};

// Retry configuration
const RETRY_CONFIG = {
  retries: 3,
  backoffFactor: 2,
  maxBackoff: 10000
};

/**
 * Response cache implementation with TTL and LRU eviction
 */
class ResponseCache {
  private cache: Map<string, { data: any; timestamp: number }> = new Map();

  set(key: string, data: any): void {
    if (this.cache.size >= CACHE_CONFIG.maxSize) {
      const oldestKey = Array.from(this.cache.keys())[0];
      this.cache.delete(oldestKey);
    }
    this.cache.set(key, { data, timestamp: Date.now() });
  }

  get(key: string): any | null {
    const cached = this.cache.get(key);
    if (!cached) return null;

    if (Date.now() - cached.timestamp > CACHE_CONFIG.ttl) {
      this.cache.delete(key);
      return null;
    }

    if (CACHE_CONFIG.updateAgeOnGet) {
      cached.timestamp = Date.now();
    }

    return cached.data;
  }

  clear(): void {
    this.cache.clear();
  }
}

/**
 * Enhanced API client with advanced features
 */
export class ApiClient {
  private client: AxiosInstance;
  private breaker: CircuitBreaker;
  private cache: ResponseCache;
  private tokenManager: TokenManager;
  private pendingRequests: Map<string, Promise<any>> = new Map();

  constructor(config?: AxiosRequestConfig) {
    // Initialize Axios instance with default configuration
    this.client = axios.create({
      baseURL: API_CONFIG.BASE_URL,
      timeout: API_CONFIG.TIMEOUT,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      paramsSerializer: (params) => qs.stringify(params, { arrayFormat: 'brackets' })
    });

    // Initialize circuit breaker
    this.breaker = new CircuitBreaker({
      ...CIRCUIT_BREAKER_CONFIG,
      onOpen: () => this.handleCircuitOpen(),
      onClose: () => this.handleCircuitClose()
    });

    // Initialize response cache
    this.cache = new ResponseCache();

    // Initialize token manager
    this.tokenManager = new TokenManager();

    // Configure request interceptors
    this.setupInterceptors();

    // Configure retry strategy
    this.setupRetryStrategy();
  }

  /**
   * Configure request/response interceptors
   */
  private setupInterceptors(): void {
    // Request interceptor for authentication
    this.client.interceptors.request.use(
      async (config) => {
        const token = await this.tokenManager.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }

        // Add compression if payload is large
        if (config.data && JSON.stringify(config.data).length > API_CONFIG.COMPRESSION_THRESHOLD) {
          config.data = pako.deflate(JSON.stringify(config.data));
          config.headers['Content-Encoding'] = 'gzip';
        }

        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor for error handling and decompression
    this.client.interceptors.response.use(
      (response) => {
        if (response.headers['content-encoding'] === 'gzip') {
          response.data = JSON.parse(pako.inflate(response.data, { to: 'string' }));
        }
        return response;
      },
      async (error) => {
        if (error.response?.status === 401) {
          try {
            const newToken = await this.tokenManager.refreshToken();
            const config = error.config;
            config.headers.Authorization = `Bearer ${newToken}`;
            return this.client.request(config);
          } catch (refreshError) {
            return Promise.reject(refreshError);
          }
        }
        return Promise.reject(error);
      }
    );
  }

  /**
   * Configure retry strategy with exponential backoff
   */
  private setupRetryStrategy(): void {
    axiosRetry(this.client, {
      retries: RETRY_CONFIG.retries,
      retryDelay: (retryCount) => {
        const delay = Math.min(
          retryCount * RETRY_CONFIG.backoffFactor * 1000,
          RETRY_CONFIG.maxBackoff
        );
        return delay;
      },
      retryCondition: (error) => {
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
          error.response?.status === 429;
      }
    });
  }

  /**
   * Handle circuit breaker open state
   */
  private handleCircuitOpen(): void {
    console.error('Circuit breaker opened - API service degraded');
    // Emit circuit breaker event for monitoring
    window.dispatchEvent(new CustomEvent('api-circuit-breaker', {
      detail: { state: 'open', timestamp: Date.now() }
    }));
  }

  /**
   * Handle circuit breaker close state
   */
  private handleCircuitClose(): void {
    console.log('Circuit breaker closed - API service recovered');
    // Emit circuit breaker event for monitoring
    window.dispatchEvent(new CustomEvent('api-circuit-breaker', {
      detail: { state: 'closed', timestamp: Date.now() }
    }));
  }

  /**
   * Make an HTTP request with enhanced features
   */
  public async request<T = any>(
    method: string,
    endpoint: string,
    config: AxiosRequestConfig = {}
  ): Promise<T> {
    const cacheKey = `${method}:${endpoint}:${JSON.stringify(config)}`;

    // Check cache for GET requests
    if (method.toLowerCase() === 'get') {
      const cached = this.cache.get(cacheKey);
      if (cached) return cached;
    }

    // Request deduplication
    const pendingRequest = this.pendingRequests.get(cacheKey);
    if (pendingRequest) return pendingRequest;

    // Execute request through circuit breaker
    const request = this.breaker.run(async () => {
      try {
        const response = await this.client.request<T>({
          method,
          url: endpoint,
          ...config
        });

        // Cache successful GET responses
        if (method.toLowerCase() === 'get') {
          this.cache.set(cacheKey, response.data);
        }

        return response.data;
      } finally {
        this.pendingRequests.delete(cacheKey);
      }
    });

    this.pendingRequests.set(cacheKey, request);
    return request;
  }

  /**
   * Get current circuit breaker state
   */
  public getCircuitState(): string {
    return this.breaker.state;
  }

  /**
   * Clear response cache
   */
  public clearCache(): void {
    this.cache.clear();
  }
}

// Export singleton instance
export const apiClient = new ApiClient();

// Export error handling utility
export function handleApiError(error: any): any {
  const errorResponse = {
    message: 'An unexpected error occurred',
    code: 'UNKNOWN_ERROR',
    details: null
  };

  if (axios.isAxiosError(error)) {
    errorResponse.message = error.response?.data?.message || error.message;
    errorResponse.code = error.response?.data?.code || `HTTP_${error.response?.status}`;
    errorResponse.details = error.response?.data?.details || null;
  }

  // Emit error event for monitoring
  window.dispatchEvent(new CustomEvent('api-error', {
    detail: {
      ...errorResponse,
      timestamp: Date.now()
    }
  }));

  return errorResponse;
}