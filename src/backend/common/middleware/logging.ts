import { injectable } from 'inversify';
import express from 'express';
import winston from 'winston';
import morgan from 'morgan';
import { EventEmitter2 } from 'eventemitter2';
import { DatadogMonitor } from '../../monitoring/datadog';
import { PrometheusMonitor } from '../../monitoring/prometheus';
import { MetricType, MetricUnit } from '../interfaces/metric.interface';

// External library versions
// express: ^4.18.0
// winston: ^3.8.0
// morgan: ^1.10.0
// eventemitter2: ^6.4.0

const LOG_CONFIG = {
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.json(),
  maxFiles: '14d',
  maxSize: '100m',
  sanitize: ['password', 'token', 'apiKey', 'secret', 'authorization']
};

/**
 * Creates and configures a Winston logger instance with multiple transports
 */
export function createLogger(config = LOG_CONFIG): winston.Logger {
  const logger = winston.createLogger({
    level: config.level,
    format: winston.format.combine(
      winston.format.timestamp(),
      winston.format.json(),
      winston.format.errors({ stack: true })
    )
  });

  // Console transport for development
  if (process.env.NODE_ENV !== 'production') {
    logger.add(new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }));
  }

  // File transport with rotation
  logger.add(new winston.transports.File({
    filename: 'logs/application.log',
    maxFiles: config.maxFiles,
    maxsize: config.maxSize,
    tailable: true
  }));

  // Error-specific transport
  logger.add(new winston.transports.File({
    filename: 'logs/error.log',
    level: 'error',
    maxFiles: config.maxFiles,
    maxsize: config.maxSize
  }));

  return logger;
}

/**
 * Express middleware for comprehensive request/response logging and monitoring
 */
@injectable()
export class LoggingMiddleware {
  private logger: winston.Logger;
  private metricEmitter: EventEmitter2;
  private responseTimeHistogram: any;
  private errorRateCounter: any;

  constructor(
    private datadogMonitor: DatadogMonitor,
    private prometheusMonitor: PrometheusMonitor
  ) {
    this.logger = createLogger();
    this.metricEmitter = new EventEmitter2({
      wildcard: true,
      delimiter: '.',
      maxListeners: 20,
      verboseMemoryLeak: true
    });

    // Initialize monitoring histograms
    this.initializeMetrics();
    this.setupMetricEmitter();
  }

  private initializeMetrics(): void {
    // Initialize Datadog histograms
    this.datadogMonitor.createHistogram('api.response.time', ['endpoint', 'method']);
    this.datadogMonitor.createHistogram('api.error.rate', ['endpoint', 'type']);

    // Initialize Prometheus histograms
    this.prometheusMonitor.recordMetric({
      id: 'api_response_time',
      name: 'API Response Time',
      type: MetricType.LATENCY,
      value: 0,
      unit: MetricUnit.MILLISECONDS,
      timestamp: new Date(),
      service: 'api',
      environment: process.env.NODE_ENV || 'development',
      metadata: {},
      tags: {}
    });
  }

  private setupMetricEmitter(): void {
    this.metricEmitter.on('metric.response.time', (data: any) => {
      this.datadogMonitor.recordMetric({
        id: data.id,
        name: 'api.response.time',
        type: MetricType.LATENCY,
        value: data.duration,
        unit: MetricUnit.MILLISECONDS,
        timestamp: new Date(),
        service: 'api',
        environment: process.env.NODE_ENV || 'development',
        metadata: data.metadata,
        tags: data.tags
      });
    });

    this.metricEmitter.on('metric.error', (data: any) => {
      this.prometheusMonitor.recordMetric({
        id: data.id,
        name: 'api.error.rate',
        type: MetricType.ERROR_RATE,
        value: 1,
        unit: MetricUnit.COUNT,
        timestamp: new Date(),
        service: 'api',
        environment: process.env.NODE_ENV || 'development',
        metadata: data.metadata,
        tags: data.tags
      });
    });
  }

  private sanitizeData(data: any): any {
    const sanitized = { ...data };
    LOG_CONFIG.sanitize.forEach(field => {
      if (sanitized[field]) {
        sanitized[field] = '[REDACTED]';
      }
    });
    return sanitized;
  }

  public logRequest(): express.RequestHandler {
    return (req: express.Request, res: express.Response, next: express.NextFunction) => {
      const startTime = process.hrtime();
      const correlationId = req.headers['x-correlation-id'] || 
                           `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

      // Attach correlation ID
      req.headers['x-correlation-id'] = correlationId;
      res.setHeader('x-correlation-id', correlationId);

      // Log request
      this.logger.info('Incoming request', {
        correlationId,
        method: req.method,
        url: req.url,
        headers: this.sanitizeData(req.headers),
        query: this.sanitizeData(req.query),
        body: this.sanitizeData(req.body),
        ip: req.ip
      });

      // Response logging
      res.on('finish', () => {
        const [seconds, nanoseconds] = process.hrtime(startTime);
        const duration = seconds * 1000 + nanoseconds / 1000000;

        // Log response
        this.logger.info('Response sent', {
          correlationId,
          statusCode: res.statusCode,
          duration,
          contentLength: res.get('content-length')
        });

        // Emit metrics
        this.metricEmitter.emit('metric.response.time', {
          id: correlationId,
          duration,
          metadata: {
            statusCode: res.statusCode,
            method: req.method,
            path: req.path
          },
          tags: {
            endpoint: req.path,
            method: req.method,
            status: res.statusCode.toString()
          }
        });

        // Track errors
        if (res.statusCode >= 400) {
          this.metricEmitter.emit('metric.error', {
            id: correlationId,
            metadata: {
              statusCode: res.statusCode,
              method: req.method,
              path: req.path
            },
            tags: {
              endpoint: req.path,
              type: res.statusCode >= 500 ? 'server' : 'client'
            }
          });
        }
      });

      next();
    };
  }
}