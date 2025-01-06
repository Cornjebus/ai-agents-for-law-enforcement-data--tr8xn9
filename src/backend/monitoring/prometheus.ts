import { injectable } from 'inversify';
import * as client from 'prom-client';
import { Express, Request, Response } from 'express';
import { IMetric, MetricType, MetricUnit } from '../common/interfaces/metric.interface';

// Version comments for external dependencies
// prom-client: ^14.2.0 - Prometheus client for Node.js
// express: ^4.18.2 - Web framework for Node.js
// inversify: ^6.0.1 - Dependency injection container

const PROMETHEUS_CONFIG = {
    prefix: 'revenue_automation_',
    defaultLabels: { environment: process.env.NODE_ENV },
    alertThresholds: {
        apiRequestRate: 1000,    // requests/sec
        errorRate: 0.01,         // 1%
        authFailures: 5          // failures/min
    }
};

const METRIC_BUCKETS = {
    api: [0.01, 0.025, 0.05, 0.1, 0.25],         // API response time buckets (s)
    voice: [0.05, 0.1, 0.2, 0.5, 1],             // Voice processing buckets (s)
    content: [0.1, 0.5, 1, 2, 5],                // Content generation buckets (s)
    db: [0.001, 0.005, 0.01, 0.025, 0.05]        // Database query buckets (s)
};

interface PrometheusConfig {
    prefix: string;
    defaultLabels: Record<string, string>;
    alertThresholds: Record<string, number>;
}

@injectable()
export class PrometheusMonitor {
    private registry: client.Registry;
    private config: PrometheusConfig;
    private counters: Map<string, client.Counter>;
    private gauges: Map<string, client.Gauge>;
    private histograms: Map<string, client.Histogram>;
    private metricBuffer: Map<string, Array<IMetric>>;

    constructor(config: PrometheusConfig = PROMETHEUS_CONFIG) {
        this.config = config;
        this.registry = new client.Registry();
        this.counters = new Map();
        this.gauges = new Map();
        this.histograms = new Map();
        this.metricBuffer = new Map();

        this.initializeCollectors();
    }

    private initializeCollectors(): void {
        // Performance metrics
        this.histograms.set('api_response_time', new client.Histogram({
            name: `${this.config.prefix}api_response_time`,
            help: 'API response time in seconds',
            labelNames: ['endpoint', 'method'],
            buckets: METRIC_BUCKETS.api,
            registers: [this.registry]
        }));

        this.histograms.set('voice_processing_time', new client.Histogram({
            name: `${this.config.prefix}voice_processing_time`,
            help: 'Voice processing time in seconds',
            labelNames: ['operation_type'],
            buckets: METRIC_BUCKETS.voice,
            registers: [this.registry]
        }));

        this.histograms.set('content_generation_time', new client.Histogram({
            name: `${this.config.prefix}content_generation_time`,
            help: 'Content generation time in seconds',
            labelNames: ['content_type'],
            buckets: METRIC_BUCKETS.content,
            registers: [this.registry]
        }));

        // Security metrics
        this.counters.set('api_requests_total', new client.Counter({
            name: `${this.config.prefix}api_requests_total`,
            help: 'Total API requests',
            labelNames: ['endpoint', 'method', 'status'],
            registers: [this.registry]
        }));

        this.counters.set('auth_failures', new client.Counter({
            name: `${this.config.prefix}auth_failures`,
            help: 'Authentication failures',
            labelNames: ['reason'],
            registers: [this.registry]
        }));

        // Business metrics
        this.gauges.set('active_campaigns', new client.Gauge({
            name: `${this.config.prefix}active_campaigns`,
            help: 'Number of active campaigns',
            registers: [this.registry]
        }));

        this.gauges.set('revenue_current', new client.Gauge({
            name: `${this.config.prefix}revenue_current`,
            help: 'Current revenue in USD',
            registers: [this.registry]
        }));
    }

    public recordMetric(metric: IMetric): void {
        try {
            switch (metric.type) {
                case MetricType.LATENCY:
                    this.recordLatencyMetric(metric);
                    break;
                case MetricType.ERROR_RATE:
                    this.recordErrorMetric(metric);
                    break;
                case MetricType.THROUGHPUT:
                    this.recordThroughputMetric(metric);
                    break;
                case MetricType.REVENUE:
                    this.recordBusinessMetric(metric);
                    break;
                default:
                    this.bufferMetric(metric);
            }
        } catch (error) {
            console.error(`Failed to record metric: ${error.message}`);
            this.bufferMetric(metric);
        }
    }

    private recordLatencyMetric(metric: IMetric): void {
        const histogram = this.histograms.get(this.getHistogramName(metric));
        if (histogram) {
            histogram.observe(metric.value);
        }
    }

    private recordErrorMetric(metric: IMetric): void {
        const counter = this.counters.get('api_requests_total');
        if (counter) {
            counter.inc({ status: 'error', ...metric.tags });
        }
    }

    private recordThroughputMetric(metric: IMetric): void {
        const counter = this.counters.get('api_requests_total');
        if (counter) {
            counter.inc({ status: 'success', ...metric.tags });
        }
    }

    private recordBusinessMetric(metric: IMetric): void {
        const gauge = this.gauges.get(this.getGaugeName(metric));
        if (gauge) {
            gauge.set(metric.value);
        }
    }

    private bufferMetric(metric: IMetric): void {
        const buffer = this.metricBuffer.get(metric.type) || [];
        buffer.push(metric);
        this.metricBuffer.set(metric.type, buffer);
    }

    private getHistogramName(metric: IMetric): string {
        const mappings = {
            [MetricType.LATENCY]: 'api_response_time',
            [MetricType.VOICE_LATENCY]: 'voice_processing_time',
            [MetricType.CONTENT_GENERATION_TIME]: 'content_generation_time'
        };
        return mappings[metric.type] || 'api_response_time';
    }

    private getGaugeName(metric: IMetric): string {
        const mappings = {
            [MetricType.REVENUE]: 'revenue_current',
            [MetricType.CONCURRENT_USERS]: 'active_campaigns'
        };
        return mappings[metric.type] || '';
    }
}

export async function initializePrometheus(config: PrometheusConfig = PROMETHEUS_CONFIG): Promise<void> {
    try {
        // Enable default metrics collection
        client.collectDefaultMetrics({
            prefix: config.prefix,
            labels: config.defaultLabels,
            register: new client.Registry()
        });

        console.log('Prometheus metrics collection initialized');
    } catch (error) {
        console.error('Failed to initialize Prometheus:', error);
        throw error;
    }
}

export function createMetricsEndpoint(app: Express): void {
    app.get('/metrics', async (req: Request, res: Response) => {
        try {
            res.set('Content-Type', client.register.contentType);
            const metrics = await client.register.metrics();
            res.send(metrics);
        } catch (error) {
            console.error('Error exposing metrics:', error);
            res.status(500).send('Error collecting metrics');
        }
    });
}