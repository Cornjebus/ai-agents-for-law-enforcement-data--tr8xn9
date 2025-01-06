import { injectable } from 'tsyringe'; // v4.8.0
import { Request, Response } from 'express'; // v4.18.2
import { controller, httpGet, httpPost, route } from 'tsoa'; // v5.1.1
import { rateLimit } from 'express-rate-limit'; // v6.7.0
import { Cache } from 'memory-cache'; // v0.2.0
import { MetricModel } from '../models/metric.model';
import { PredictionService } from '../services/prediction.service';
import { ReportingService } from '../services/reporting.service';
import { 
    MetricType,
    IMetric,
    IMetricQuery 
} from '../../../common/interfaces/metric.interface';

@injectable()
@controller('api/v1/metrics')
@rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later'
})
export class MetricsController {
    private readonly cache: Cache;
    private readonly CACHE_TTL = 300; // 5 minutes
    private readonly PERFORMANCE_THRESHOLD = 200; // 200ms threshold

    constructor(
        private readonly metricModel: MetricModel,
        private readonly predictionService: PredictionService,
        private readonly reportingService: ReportingService
    ) {
        this.cache = new Cache();
    }

    @httpPost('/')
    async createMetric(req: Request, res: Response): Promise<Response> {
        try {
            const startTime = Date.now();
            const metric: IMetric = req.body;

            // Validate metric data
            if (!this.validateMetric(metric)) {
                return res.status(400).json({
                    error: 'Invalid metric data'
                });
            }

            // Create metric with performance tracking
            const result = await this.metricModel.create(metric);
            const processingTime = Date.now() - startTime;

            // Track performance
            await this.trackPerformance(processingTime);

            // Invalidate relevant caches
            this.invalidateRelatedCaches(metric.type);

            return res.status(201).json({
                data: result,
                processingTime
            });
        } catch (error) {
            console.error('Error creating metric:', error);
            return res.status(500).json({
                error: 'Internal server error'
            });
        }
    }

    @httpGet('/')
    async getMetrics(req: Request, res: Response): Promise<Response> {
        try {
            const startTime = Date.now();
            const query = this.buildMetricQuery(req.query);
            const cacheKey = `metrics:${JSON.stringify(query)}`;

            // Check cache
            const cachedResult = this.cache.get(cacheKey);
            if (cachedResult) {
                return res.json({
                    data: cachedResult,
                    source: 'cache'
                });
            }

            // Query metrics
            const metrics = await this.metricModel.query(query);
            const processingTime = Date.now() - startTime;

            // Cache results
            this.cache.put(cacheKey, metrics, this.CACHE_TTL * 1000);

            // Track performance
            await this.trackPerformance(processingTime);

            return res.json({
                data: metrics,
                processingTime,
                source: 'database'
            });
        } catch (error) {
            console.error('Error fetching metrics:', error);
            return res.status(500).json({
                error: 'Internal server error'
            });
        }
    }

    @httpGet('/performance')
    async getPerformanceReport(req: Request, res: Response): Promise<Response> {
        try {
            const report = await this.reportingService.generatePerformanceReport({
                startTime: new Date(req.query.startTime as string),
                endTime: new Date(req.query.endTime as string),
                filters: req.query.filters as Record<string, any>
            });

            return res.json({ data: report });
        } catch (error) {
            console.error('Error generating performance report:', error);
            return res.status(500).json({
                error: 'Internal server error'
            });
        }
    }

    @httpGet('/revenue')
    async getRevenueReport(req: Request, res: Response): Promise<Response> {
        try {
            const report = await this.reportingService.generateRevenueReport({
                startTime: new Date(req.query.startTime as string),
                endTime: new Date(req.query.endTime as string),
                filters: req.query.filters as Record<string, any>
            });

            return res.json({ data: report });
        } catch (error) {
            console.error('Error generating revenue report:', error);
            return res.status(500).json({
                error: 'Internal server error'
            });
        }
    }

    @httpGet('/predictions')
    async getPredictions(req: Request, res: Response): Promise<Response> {
        try {
            const predictions = await this.predictionService.predictRevenue({
                timeframe: req.query.timeframe as string,
                metrics: (req.query.metrics as string).split(','),
                confidenceLevel: parseFloat(req.query.confidence as string) || 0.95
            });

            return res.json({ data: predictions });
        } catch (error) {
            console.error('Error generating predictions:', error);
            return res.status(500).json({
                error: 'Internal server error'
            });
        }
    }

    @httpGet('/health')
    async getHealthCheck(_req: Request, res: Response): Promise<Response> {
        try {
            const metrics = await this.metricModel.query({
                startTime: new Date(Date.now() - 5 * 60 * 1000), // Last 5 minutes
                endTime: new Date(),
                types: [MetricType.LATENCY],
                limit: 100,
                offset: 0
            });

            const avgLatency = metrics.reduce((acc, m) => acc + m.value, 0) / metrics.length;
            const status = avgLatency <= this.PERFORMANCE_THRESHOLD ? 'healthy' : 'degraded';

            return res.json({
                status,
                latency: avgLatency,
                timestamp: new Date()
            });
        } catch (error) {
            console.error('Health check failed:', error);
            return res.status(503).json({
                status: 'unhealthy',
                error: 'Service unavailable'
            });
        }
    }

    private validateMetric(metric: IMetric): boolean {
        return (
            metric &&
            metric.type &&
            metric.value !== undefined &&
            metric.timestamp &&
            Object.values(MetricType).includes(metric.type)
        );
    }

    private buildMetricQuery(queryParams: any): IMetricQuery {
        return {
            startTime: new Date(queryParams.startTime || Date.now() - 24 * 60 * 60 * 1000),
            endTime: new Date(queryParams.endTime || Date.now()),
            types: queryParams.types ? queryParams.types.split(',') as MetricType[] : undefined,
            tags: queryParams.tags ? JSON.parse(queryParams.tags) : {},
            groupBy: queryParams.groupBy ? queryParams.groupBy.split(',') : undefined,
            filters: queryParams.filters ? JSON.parse(queryParams.filters) : {},
            limit: parseInt(queryParams.limit || '100'),
            offset: parseInt(queryParams.offset || '0')
        };
    }

    private async trackPerformance(processingTime: number): Promise<void> {
        await this.metricModel.create({
            type: MetricType.LATENCY,
            value: processingTime,
            timestamp: new Date(),
            service: 'metrics-controller',
            environment: process.env.NODE_ENV || 'development'
        } as IMetric);
    }

    private invalidateRelatedCaches(metricType: MetricType): void {
        const patterns = [
            `metrics:*${metricType}*`,
            'performance:*',
            'revenue:*'
        ];
        patterns.forEach(pattern => this.cache.del(pattern));
    }
}