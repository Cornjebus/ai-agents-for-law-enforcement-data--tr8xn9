/**
 * @fileoverview Enhanced analytics service for handling data fetching, real-time updates,
 * and performance monitoring for the analytics dashboard
 * Version: 1.0.0
 */

import { io, Socket } from 'socket.io-client'; // v4.7.1
import * as pako from 'pako'; // v2.1.0
import { trace, context, SpanStatusCode } from '@opentelemetry/api'; // v1.4.1
import { ApiClient } from '../lib/api';
import { 
  IAnalyticsMetric, 
  IAnalyticsFilter, 
  IAnalyticsDashboard,
  MetricType,
  TimeRange 
} from '../types/analytics';
import { ANALYTICS_CONFIG } from '../lib/constants';

// API endpoints for analytics
const API_ENDPOINTS = {
  DASHBOARD: '/api/v1/analytics/dashboard',
  METRICS: '/api/v1/analytics/metrics',
  REALTIME: '/api/v1/analytics/realtime'
};

// Performance monitoring thresholds
const PERFORMANCE_THRESHOLDS = {
  METRIC_PROCESSING: 100, // ms
  API_RESPONSE: 2000, // ms
  WEBSOCKET_LATENCY: 200 // ms
};

// WebSocket configuration
const SOCKET_CONFIG = {
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  reconnectionAttempts: 5
};

/**
 * Enhanced analytics service class with real-time updates and performance monitoring
 */
export class AnalyticsService {
  private apiClient: ApiClient;
  private socket: Socket | null = null;
  private currentFilter: IAnalyticsFilter | null = null;
  private metricCache: Map<string, IAnalyticsMetric> = new Map();
  private updateCallbacks: Set<(metrics: IAnalyticsMetric[]) => void> = new Set();
  private reconnectAttempts: number = 0;
  private readonly tracer = trace.getTracer('analytics-service');

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
    this.initializeWebSocket();
  }

  /**
   * Initialize WebSocket connection with retry logic and monitoring
   */
  private initializeWebSocket(): void {
    const socketUrl = `${process.env.NEXT_PUBLIC_WS_URL || ''}/analytics`;
    
    this.socket = io(socketUrl, {
      transports: ['websocket'],
      reconnection: true,
      ...SOCKET_CONFIG
    });

    this.setupSocketListeners();
  }

  /**
   * Configure WebSocket event listeners with error handling
   */
  private setupSocketListeners(): void {
    if (!this.socket) return;

    this.socket.on('connect', () => {
      this.reconnectAttempts = 0;
      console.log('Analytics WebSocket connected');
    });

    this.socket.on('metrics_update', (data: string) => {
      const span = this.tracer.startSpan('process_metrics_update');
      try {
        const startTime = performance.now();
        const metrics = this.processMetricUpdate(data);
        const processingTime = performance.now() - startTime;

        if (processingTime > PERFORMANCE_THRESHOLDS.METRIC_PROCESSING) {
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: `Metric processing exceeded threshold: ${processingTime}ms`
          });
        }

        this.updateCallbacks.forEach(callback => callback([metrics]));
        span.end();
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error.message
        });
        span.end();
        console.error('Error processing metrics update:', error);
      }
    });

    this.socket.on('disconnect', () => {
      console.warn('Analytics WebSocket disconnected');
    });

    this.socket.on('error', (error) => {
      console.error('Analytics WebSocket error:', error);
    });
  }

  /**
   * Fetch complete dashboard data with compression and caching
   */
  public async getDashboardData(filter: IAnalyticsFilter): Promise<IAnalyticsDashboard> {
    const span = this.tracer.startSpan('get_dashboard_data');
    
    try {
      const startTime = performance.now();
      
      // Compress filter data for large requests
      const compressedFilter = filter.timeRange === TimeRange.CUSTOM ? 
        pako.deflate(JSON.stringify(filter)) : 
        JSON.stringify(filter);

      const response = await this.apiClient.request<IAnalyticsDashboard>(
        'POST',
        API_ENDPOINTS.DASHBOARD,
        { data: compressedFilter }
      );

      const requestTime = performance.now() - startTime;
      if (requestTime > PERFORMANCE_THRESHOLDS.API_RESPONSE) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `Dashboard request exceeded threshold: ${requestTime}ms`
        });
      }

      this.currentFilter = filter;
      this.updateMetricCache(response.metrics);

      span.end();
      return response;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });
      span.end();
      throw error;
    }
  }

  /**
   * Fetch specific metrics with enhanced error handling
   */
  public async getMetrics(filter: IAnalyticsFilter): Promise<IAnalyticsMetric[]> {
    const span = this.tracer.startSpan('get_metrics');
    
    try {
      const response = await this.apiClient.request<IAnalyticsMetric[]>(
        'POST',
        API_ENDPOINTS.METRICS,
        { data: filter }
      );

      this.updateMetricCache(response);
      span.end();
      return response;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });
      span.end();
      throw error;
    }
  }

  /**
   * Subscribe to real-time metric updates with reliability enhancements
   */
  public subscribeToUpdates(
    callback: (metrics: IAnalyticsMetric[]) => void,
    filter?: IAnalyticsFilter
  ): () => void {
    if (!this.socket?.connected) {
      this.initializeWebSocket();
    }

    if (filter) {
      this.socket?.emit('subscribe', filter);
    }

    this.updateCallbacks.add(callback);

    // Return unsubscribe function
    return () => {
      this.updateCallbacks.delete(callback);
      if (filter) {
        this.socket?.emit('unsubscribe', filter);
      }
    };
  }

  /**
   * Process incoming metric updates with validation and monitoring
   */
  private processMetricUpdate(data: string): IAnalyticsMetric {
    const span = this.tracer.startSpan('process_metric_update');
    
    try {
      // Decompress if data is compressed
      const isCompressed = data.startsWith('x');
      const metricData = isCompressed ? 
        JSON.parse(pako.inflate(data.slice(1), { to: 'string' })) :
        JSON.parse(data);

      // Validate metric data
      if (!this.validateMetricData(metricData)) {
        throw new Error('Invalid metric data received');
      }

      // Calculate performance metrics
      const metric: IAnalyticsMetric = {
        ...metricData,
        status: this.calculateMetricStatus(metricData)
      };

      this.metricCache.set(metric.id, metric);
      span.end();
      return metric;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error.message
      });
      span.end();
      throw error;
    }
  }

  /**
   * Validate incoming metric data structure
   */
  private validateMetricData(data: any): boolean {
    return (
      data &&
      typeof data.id === 'string' &&
      Object.values(MetricType).includes(data.type) &&
      typeof data.value === 'number'
    );
  }

  /**
   * Calculate metric status based on thresholds
   */
  private calculateMetricStatus(
    metric: IAnalyticsMetric
  ): 'normal' | 'warning' | 'critical' {
    const threshold = ANALYTICS_CONFIG.PERFORMANCE_THRESHOLDS[metric.type];
    if (!threshold) return 'normal';

    const value = metric.value;
    if (value > threshold * 1.5) return 'critical';
    if (value > threshold) return 'warning';
    return 'normal';
  }

  /**
   * Update metric cache with new data
   */
  private updateMetricCache(metrics: IAnalyticsMetric[]): void {
    metrics.forEach(metric => {
      this.metricCache.set(metric.id, metric);
    });
  }

  /**
   * Clean up resources and connections
   */
  public dispose(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.updateCallbacks.clear();
    this.metricCache.clear();
  }
}

// Export singleton instance
export const analyticsService = new AnalyticsService(new ApiClient());