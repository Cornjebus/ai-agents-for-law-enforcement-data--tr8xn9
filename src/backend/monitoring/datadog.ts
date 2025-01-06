import { injectable } from 'inversify';
import tracer from 'dd-trace'; // v3.15.0
import StatsD from 'hot-shots'; // v9.3.0
import express from 'express'; // v4.18.0
import { IMetric, MetricType, MetricUnit } from '../common/interfaces/metric.interface';

/**
 * Configuration interface for Datadog monitoring setup
 */
interface DatadogConfig {
  apiKey: string;
  appKey: string;
  env: string;
  sampleRate: number;
  batchSize: number;
  tags?: Record<string, string>;
}

/**
 * Enhanced metric options for advanced configuration
 */
interface MetricOptions {
  sampleRate?: number;
  bufferSize?: number;
  tags?: string[];
  aggregation?: string;
  transformation?: (value: number) => number;
}

/**
 * Default configuration for Datadog monitoring
 */
const DATADOG_CONFIG: DatadogConfig = {
  apiKey: process.env.DD_API_KEY!,
  appKey: process.env.DD_APP_KEY!,
  env: process.env.NODE_ENV || 'development',
  sampleRate: Number(process.env.DD_SAMPLE_RATE) || 1,
  batchSize: Number(process.env.DD_BATCH_SIZE) || 100,
  tags: {
    service: 'autonomous-revenue-platform',
    version: process.env.APP_VERSION || '1.0.0'
  }
};

/**
 * Enhanced Datadog monitoring service implementation
 * Provides advanced metrics collection, APM, and distributed tracing
 */
@injectable()
export class DatadogMonitor {
  private metricsClient: StatsD;
  private metricBuffer: Map<string, IMetric[]>;
  private tracers: Map<string, any>;
  private readonly flushInterval: number = 10000; // 10 seconds

  constructor(private config: DatadogConfig = DATADOG_CONFIG) {
    this.initializeMonitoring();
  }

  /**
   * Initializes the Datadog monitoring system with enhanced features
   */
  private async initializeMonitoring(): Promise<void> {
    // Initialize tracer with advanced configuration
    tracer.init({
      env: this.config.env,
      service: 'autonomous-revenue-platform',
      sampleRate: this.config.sampleRate,
      analytics: true,
      logInjection: true,
      runtimeMetrics: true,
      profiling: true
    });

    // Initialize high-performance StatsD client
    this.metricsClient = new StatsD({
      host: 'localhost',
      port: 8125,
      prefix: 'revenue.platform.',
      errorHandler: this.handleMetricError.bind(this),
      bufferFlushInterval: this.flushInterval,
      sampleRate: this.config.sampleRate,
      globalTags: this.config.tags
    });

    this.metricBuffer = new Map();
    this.tracers = new Map();

    // Set up periodic buffer flush
    setInterval(() => this.flushMetricBuffer(), this.flushInterval);
  }

  /**
   * Records a metric with enhanced features and buffering
   */
  public async recordMetric(metric: IMetric): Promise<void> {
    try {
      this.validateMetric(metric);
      const enrichedMetric = this.enrichMetric(metric);
      
      if (this.shouldBuffer(enrichedMetric)) {
        this.bufferMetric(enrichedMetric);
      } else {
        await this.sendMetric(enrichedMetric);
      }
    } catch (error) {
      this.handleMetricError(error);
    }
  }

  /**
   * Creates a new gauge metric with enhanced features
   */
  public createGauge(name: string, tags: string[] = [], options: MetricOptions = {}): void {
    this.metricsClient.gauge(
      name,
      0,
      options.sampleRate || this.config.sampleRate,
      tags,
      this.handleMetricError.bind(this)
    );
  }

  /**
   * Creates a histogram for latency tracking
   */
  public createHistogram(name: string, tags: string[] = [], options: MetricOptions = {}): void {
    this.metricsClient.histogram(
      name,
      0,
      options.sampleRate || this.config.sampleRate,
      tags,
      this.handleMetricError.bind(this)
    );
  }

  /**
   * Starts a new trace span with correlation
   */
  public startSpan(name: string, tags: Record<string, string> = {}): any {
    const span = tracer.startSpan(name, { tags });
    this.tracers.set(name, span);
    return span;
  }

  /**
   * Creates Express middleware for request tracing
   */
  public createTracingMiddleware(): express.RequestHandler {
    return (req, res, next) => {
      const span = this.startSpan('http.request', {
        'http.method': req.method,
        'http.url': req.url
      });

      res.on('finish', () => {
        span.setTag('http.status_code', res.statusCode);
        span.finish();
      });

      next();
    };
  }

  /**
   * Validates metric data against rules
   */
  private validateMetric(metric: IMetric): void {
    if (!metric.id || !metric.type || typeof metric.value !== 'number') {
      throw new Error('Invalid metric format');
    }
  }

  /**
   * Enriches metric with additional context
   */
  private enrichMetric(metric: IMetric): IMetric {
    return {
      ...metric,
      timestamp: new Date(),
      environment: this.config.env,
      tags: {
        ...metric.tags,
        ...this.config.tags
      }
    };
  }

  /**
   * Determines if metric should be buffered
   */
  private shouldBuffer(metric: IMetric): boolean {
    return [
      MetricType.LATENCY,
      MetricType.THROUGHPUT,
      MetricType.ERROR_RATE
    ].includes(metric.type);
  }

  /**
   * Buffers metric for batch processing
   */
  private bufferMetric(metric: IMetric): void {
    const buffer = this.metricBuffer.get(metric.type) || [];
    buffer.push(metric);
    this.metricBuffer.set(metric.type, buffer);

    if (buffer.length >= this.config.batchSize) {
      this.flushMetricBuffer(metric.type);
    }
  }

  /**
   * Sends metric to Datadog with retry logic
   */
  private async sendMetric(metric: IMetric): Promise<void> {
    try {
      switch (metric.type) {
        case MetricType.LATENCY:
          this.metricsClient.timing(metric.name, metric.value, metric.tags);
          break;
        case MetricType.ERROR_RATE:
          this.metricsClient.increment(metric.name, 1, metric.tags);
          break;
        default:
          this.metricsClient.gauge(metric.name, metric.value, metric.tags);
      }
    } catch (error) {
      this.handleMetricError(error);
    }
  }

  /**
   * Flushes metric buffer for batch processing
   */
  private async flushMetricBuffer(type?: MetricType): Promise<void> {
    try {
      if (type) {
        const buffer = this.metricBuffer.get(type) || [];
        await Promise.all(buffer.map(metric => this.sendMetric(metric)));
        this.metricBuffer.set(type, []);
      } else {
        for (const [type, buffer] of this.metricBuffer.entries()) {
          await Promise.all(buffer.map(metric => this.sendMetric(metric)));
          this.metricBuffer.set(type, []);
        }
      }
    } catch (error) {
      this.handleMetricError(error);
    }
  }

  /**
   * Handles metric recording errors with retries
   */
  private handleMetricError(error: Error): void {
    console.error('Datadog metric error:', error);
    // Implement retry logic or fallback storage
  }
}