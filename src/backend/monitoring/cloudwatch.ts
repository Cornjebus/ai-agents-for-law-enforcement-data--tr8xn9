import { CloudWatch, PutMetricDataCommand } from '@aws-sdk/client-cloudwatch';
import { CloudWatchLogs, CreateLogStreamCommand } from '@aws-sdk/client-cloudwatch-logs';
import { AWSXRay, Segment } from 'aws-xray-sdk';
import { injectable } from 'inversify';
import { IMetric, MetricType, MetricUnit } from '../common/interfaces/metric.interface';

// @version @aws-sdk/client-cloudwatch ^3.0.0
// @version @aws-sdk/client-cloudwatch-logs ^3.0.0
// @version aws-xray-sdk ^3.3.0

interface CloudWatchConfig {
    region: string;
    namespace: string;
    defaultDimensions: Record<string, string>;
    metricRetention: number;
    logRetention: number;
}

const CLOUDWATCH_CONFIG: CloudWatchConfig = {
    region: process.env.AWS_REGION || 'us-west-2',
    namespace: 'RevenueAutomation',
    defaultDimensions: {
        Environment: process.env.NODE_ENV || 'development',
        Service: 'API'
    },
    metricRetention: 90,
    logRetention: 30
};

const PERFORMANCE_THRESHOLDS = {
    apiLatency: 100, // ms
    voiceProcessing: 200, // ms
    contentGeneration: 2000, // ms
    databaseQuery: 10 // ms
};

const SECURITY_THRESHOLDS = {
    maxRequestRate: 1000, // requests per second
    maxAuthFailures: 5, // failures per minute
    maxDataAccessAttempts: 100 // attempts per minute
};

@injectable()
export class CloudWatchMonitor {
    private cloudWatch: CloudWatch;
    private cloudWatchLogs: CloudWatchLogs;
    private xray: typeof AWSXRay;
    private readonly config: CloudWatchConfig;
    private metricBuffer: Map<string, IMetric[]>;
    private readonly bufferSize: number = 20;
    private readonly bufferTimeout: number = 60000; // 1 minute

    constructor(config: CloudWatchConfig = CLOUDWATCH_CONFIG) {
        this.config = config;
        this.initializeServices();
        this.metricBuffer = new Map();
    }

    private initializeServices(): void {
        this.cloudWatch = new CloudWatch({
            region: this.config.region,
            maxAttempts: 3,
            retryMode: 'adaptive'
        });

        this.cloudWatchLogs = new CloudWatchLogs({
            region: this.config.region,
            maxAttempts: 3,
            retryMode: 'adaptive'
        });

        this.xray = AWSXRay;
        this.xray.middleware.setSamplingRules({
            rules: [{ description: 'Default', fixedRate: 0.05, httpMethod: '*', serviceName: '*', urlPath: '*' }]
        });
    }

    public async putMetricData(metric: IMetric): Promise<void> {
        try {
            this.validateMetric(metric);
            const dimensions = this.buildDimensions(metric);

            const metricData = {
                MetricName: metric.name,
                Dimensions: dimensions,
                Unit: this.mapMetricUnit(metric.unit),
                Value: metric.value,
                Timestamp: metric.timestamp || new Date()
            };

            await this.bufferMetric(metric.type, metricData);
            await this.checkThresholds(metric);
        } catch (error) {
            console.error('Error putting metric data:', error);
            throw error;
        }
    }

    public async createLogStream(logGroupName: string, logStreamName: string): Promise<void> {
        try {
            const command = new CreateLogStreamCommand({
                logGroupName,
                logStreamName
            });

            await this.cloudWatchLogs.send(command);
        } catch (error) {
            console.error('Error creating log stream:', error);
            throw error;
        }
    }

    public startTrace(name: string): Segment {
        const segment = this.xray.getSegment();
        return segment?.addNewSubsegment(name) || this.xray.getNamespace().createSegment(name);
    }

    private async bufferMetric(type: MetricType, metricData: any): Promise<void> {
        const buffer = this.metricBuffer.get(type) || [];
        buffer.push(metricData);
        this.metricBuffer.set(type, buffer);

        if (buffer.length >= this.bufferSize) {
            await this.flushMetricBuffer(type);
        }
    }

    private async flushMetricBuffer(type: MetricType): Promise<void> {
        const buffer = this.metricBuffer.get(type) || [];
        if (buffer.length === 0) return;

        const command = new PutMetricDataCommand({
            Namespace: this.config.namespace,
            MetricData: buffer
        });

        try {
            await this.cloudWatch.send(command);
            this.metricBuffer.set(type, []);
        } catch (error) {
            console.error('Error flushing metric buffer:', error);
            throw error;
        }
    }

    private async checkThresholds(metric: IMetric): Promise<void> {
        switch (metric.type) {
            case MetricType.LATENCY:
                if (metric.value > PERFORMANCE_THRESHOLDS.apiLatency) {
                    await this.createThresholdAlarm('APILatencyExceeded', metric);
                }
                break;
            case MetricType.VOICE_LATENCY:
                if (metric.value > PERFORMANCE_THRESHOLDS.voiceProcessing) {
                    await this.createThresholdAlarm('VoiceLatencyExceeded', metric);
                }
                break;
            case MetricType.CONTENT_GENERATION_TIME:
                if (metric.value > PERFORMANCE_THRESHOLDS.contentGeneration) {
                    await this.createThresholdAlarm('ContentGenerationTimeExceeded', metric);
                }
                break;
        }
    }

    private async createThresholdAlarm(alarmName: string, metric: IMetric): Promise<void> {
        // Implementation for creating CloudWatch alarms
        // This would be implemented based on specific alerting requirements
    }

    private validateMetric(metric: IMetric): void {
        if (!metric.name || !metric.type || metric.value === undefined) {
            throw new Error('Invalid metric data: Missing required fields');
        }
    }

    private buildDimensions(metric: IMetric): { Name: string; Value: string }[] {
        const dimensions = Object.entries(this.config.defaultDimensions).map(([name, value]) => ({
            Name: name,
            Value: value
        }));

        if (metric.tags) {
            Object.entries(metric.tags).forEach(([name, value]) => {
                dimensions.push({ Name: name, Value: value });
            });
        }

        return dimensions;
    }

    private mapMetricUnit(unit: MetricUnit): string {
        const unitMap: Record<MetricUnit, string> = {
            [MetricUnit.MILLISECONDS]: 'Milliseconds',
            [MetricUnit.REQUESTS_PER_SECOND]: 'Count/Second',
            [MetricUnit.QUERIES_PER_SECOND]: 'Count/Second',
            [MetricUnit.PERCENTAGE]: 'Percent',
            [MetricUnit.UPTIME_PERCENTAGE]: 'Percent',
            [MetricUnit.COUNT]: 'Count',
            [MetricUnit.DOLLARS]: 'USD',
            [MetricUnit.WORDS_PER_MINUTE]: 'Count/Minute'
        };

        return unitMap[unit] || 'None';
    }
}

export async function initializeCloudWatch(config: CloudWatchConfig = CLOUDWATCH_CONFIG): Promise<void> {
    const monitor = new CloudWatchMonitor(config);
    // Additional initialization logic if needed
    return Promise.resolve();
}

export async function putMetric(metric: IMetric): Promise<void> {
    const monitor = new CloudWatchMonitor();
    await monitor.putMetricData(metric);
}