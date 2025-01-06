import { injectable } from 'tsyringe'; // v4.8.0
import { Redis } from 'ioredis'; // v5.3.0
import { MetricModel } from '../models/metric.model';
import { createCacheClient } from '../../../common/config/cache';
import { 
    MetricType, 
    IMetricQuery, 
    IMetricAggregation 
} from '../../../common/interfaces/metric.interface';

interface IReportQuery {
    startTime: Date;
    endTime: Date;
    filters?: Record<string, any>;
    groupBy?: string[];
}

interface IPerformanceReport {
    latency: IMetricAggregation;
    throughput: IMetricAggregation;
    errorRate: IMetricAggregation;
    concurrentUsers: IMetricAggregation;
    uptime: IMetricAggregation;
    timestamp: Date;
}

interface IRevenueReport {
    totalRevenue: number;
    revenueGrowth: number;
    conversionRate: IMetricAggregation;
    forecast: {
        nextMonth: number;
        nextQuarter: number;
        confidence: number;
    };
    timestamp: Date;
}

interface ICampaignReport {
    campaignId: string;
    performance: {
        impressions: number;
        conversions: number;
        revenue: number;
        roi: number;
    };
    trends: {
        daily: Array<{ date: Date; value: number }>;
        weekly: Array<{ week: string; value: number }>;
    };
    timestamp: Date;
}

@injectable()
export class ReportingService {
    private readonly cacheClient: Redis;
    private readonly CACHE_PREFIX = 'report:';
    private readonly CACHE_TTL = {
        PERFORMANCE: 300, // 5 minutes
        REVENUE: 1800,   // 30 minutes
        CAMPAIGN: 600    // 10 minutes
    };

    constructor(
        private readonly metricModel: MetricModel
    ) {
        this.cacheClient = createCacheClient({
            keyPrefix: this.CACHE_PREFIX,
            maxRetriesPerRequest: 3,
            commandTimeout: 2000
        });
    }

    async generatePerformanceReport(query: IReportQuery): Promise<IPerformanceReport> {
        const cacheKey = `performance:${JSON.stringify(query)}`;
        const cachedReport = await this.cacheClient.get(cacheKey);

        if (cachedReport) {
            return JSON.parse(cachedReport);
        }

        const metricQuery: IMetricQuery = {
            startTime: query.startTime,
            endTime: query.endTime,
            types: [
                MetricType.LATENCY,
                MetricType.THROUGHPUT,
                MetricType.ERROR_RATE,
                MetricType.CONCURRENT_USERS,
                MetricType.UPTIME
            ],
            filters: query.filters,
            groupBy: query.groupBy,
            aggregationType: 'avg',
            tags: {},
            limit: 1000,
            offset: 0
        };

        const aggregations = await this.metricModel.aggregate(metricQuery);
        
        const report: IPerformanceReport = {
            latency: aggregations.find(a => a.type === MetricType.LATENCY)!,
            throughput: aggregations.find(a => a.type === MetricType.THROUGHPUT)!,
            errorRate: aggregations.find(a => a.type === MetricType.ERROR_RATE)!,
            concurrentUsers: aggregations.find(a => a.type === MetricType.CONCURRENT_USERS)!,
            uptime: aggregations.find(a => a.type === MetricType.UPTIME)!,
            timestamp: new Date()
        };

        await this.cacheClient.setex(
            cacheKey,
            this.CACHE_TTL.PERFORMANCE,
            JSON.stringify(report)
        );

        return report;
    }

    async generateRevenueReport(query: IReportQuery): Promise<IRevenueReport> {
        const cacheKey = `revenue:${JSON.stringify(query)}`;
        const cachedReport = await this.cacheClient.get(cacheKey);

        if (cachedReport) {
            return JSON.parse(cachedReport);
        }

        const metricQuery: IMetricQuery = {
            startTime: query.startTime,
            endTime: query.endTime,
            types: [MetricType.REVENUE, MetricType.CONVERSION_RATE],
            filters: query.filters,
            groupBy: query.groupBy,
            aggregationType: 'sum',
            tags: {},
            limit: 1000,
            offset: 0
        };

        const aggregations = await this.metricModel.aggregate(metricQuery);
        const revenueMetrics = await this.metricModel.query(metricQuery);

        const currentRevenue = aggregations.find(a => a.type === MetricType.REVENUE)!.sum;
        const previousPeriodQuery = {
            ...metricQuery,
            endTime: query.startTime,
            startTime: new Date(query.startTime.getTime() - 
                (query.endTime.getTime() - query.startTime.getTime()))
        };

        const previousRevenue = (await this.metricModel.aggregate(previousPeriodQuery))
            .find(a => a.type === MetricType.REVENUE)!.sum;

        const report: IRevenueReport = {
            totalRevenue: currentRevenue,
            revenueGrowth: ((currentRevenue - previousRevenue) / previousRevenue) * 100,
            conversionRate: aggregations.find(a => a.type === MetricType.CONVERSION_RATE)!,
            forecast: this.calculateRevenueForecast(revenueMetrics),
            timestamp: new Date()
        };

        await this.cacheClient.setex(
            cacheKey,
            this.CACHE_TTL.REVENUE,
            JSON.stringify(report)
        );

        return report;
    }

    async generateCampaignReport(query: IReportQuery): Promise<ICampaignReport> {
        const cacheKey = `campaign:${query.filters?.campaignId}:${JSON.stringify(query)}`;
        const cachedReport = await this.cacheClient.get(cacheKey);

        if (cachedReport) {
            return JSON.parse(cachedReport);
        }

        const metricQuery: IMetricQuery = {
            startTime: query.startTime,
            endTime: query.endTime,
            types: [
                MetricType.CONVERSION_RATE,
                MetricType.REVENUE
            ],
            filters: {
                ...query.filters,
                service: 'campaign'
            },
            groupBy: ['timestamp', ...(query.groupBy || [])],
            aggregationType: 'sum',
            tags: {},
            limit: 1000,
            offset: 0
        };

        const metrics = await this.metricModel.query(metricQuery);
        const aggregations = await this.metricModel.aggregate(metricQuery);

        const report: ICampaignReport = {
            campaignId: query.filters?.campaignId,
            performance: this.calculateCampaignPerformance(metrics, aggregations),
            trends: this.calculateCampaignTrends(metrics),
            timestamp: new Date()
        };

        await this.cacheClient.setex(
            cacheKey,
            this.CACHE_TTL.CAMPAIGN,
            JSON.stringify(report)
        );

        return report;
    }

    async invalidateCache(reportType: string): Promise<void> {
        const pattern = `${this.CACHE_PREFIX}${reportType}:*`;
        const keys = await this.cacheClient.keys(pattern);
        
        if (keys.length > 0) {
            await this.cacheClient.del(...keys);
        }
    }

    private calculateRevenueForecast(metrics: any[]): { nextMonth: number; nextQuarter: number; confidence: number } {
        // Implementation of revenue forecasting using time series analysis
        // This is a simplified version - in production, use more sophisticated ML models
        const values = metrics.map(m => m.value);
        const trend = values.reduce((a, b) => a + b, 0) / values.length;
        const growth = values[values.length - 1] / values[0] - 1;

        return {
            nextMonth: trend * (1 + growth),
            nextQuarter: trend * (1 + growth) * 3,
            confidence: 0.85
        };
    }

    private calculateCampaignPerformance(metrics: any[], aggregations: IMetricAggregation[]): any {
        const revenue = aggregations.find(a => a.type === MetricType.REVENUE)!.sum;
        const conversions = metrics.filter(m => m.type === MetricType.CONVERSION_RATE).length;
        const cost = metrics.reduce((acc, m) => acc + (m.metadata?.cost || 0), 0);

        return {
            impressions: metrics.length,
            conversions,
            revenue,
            roi: ((revenue - cost) / cost) * 100
        };
    }

    private calculateCampaignTrends(metrics: any[]): any {
        const daily = this.aggregateByTimeUnit(metrics, 'day');
        const weekly = this.aggregateByTimeUnit(metrics, 'week');

        return { daily, weekly };
    }

    private aggregateByTimeUnit(metrics: any[], unit: 'day' | 'week'): Array<{ date: Date; value: number }> {
        const grouped = metrics.reduce((acc, metric) => {
            const date = new Date(metric.timestamp);
            const key = unit === 'day' 
                ? date.toISOString().split('T')[0]
                : `${date.getFullYear()}-W${Math.ceil(date.getDate() / 7)}`;

            if (!acc[key]) {
                acc[key] = { sum: 0, count: 0 };
            }
            acc[key].sum += metric.value;
            acc[key].count++;
            return acc;
        }, {});

        return Object.entries(grouped).map(([key, value]: [string, any]) => ({
            date: new Date(key),
            value: value.sum / value.count
        }));
    }
}