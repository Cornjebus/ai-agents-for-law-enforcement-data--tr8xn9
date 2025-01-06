import { injectable } from 'inversify';
import { Polly, SynthesizeSpeechCommand, Voice } from '@aws-sdk/client-polly';
import CircuitBreaker from 'opossum';
import { VoiceModel, VoiceConfig, VoiceQuality } from '../models/voice';
import { IMetric, MetricType, MetricUnit } from '../../common/interfaces/metric.interface';

/**
 * Enhanced configuration interface for AWS Polly service
 */
interface PollyVoiceConfig {
    awsRegion: string;
    awsCredentials: {
        accessKeyId: string;
        secretAccessKey: string;
        region: string;
    };
    defaultVoiceId: string;
    engine: 'neural' | 'standard';
    geographicRouting: {
        enabled: boolean;
        regions: string[];
        latencyThreshold: number;
        failoverStrategy: 'nearest' | 'round-robin' | 'performance';
    };
    performance: {
        maxLatency: number;
        cacheTimeout: number;
        compressionThreshold: number;
        errorThreshold: number;
    };
    caching: {
        enabled: boolean;
        ttl: number;
        maxSize: number;
    };
    compression: {
        enabled: boolean;
        quality: number;
        format: 'mp3' | 'ogg';
    };
}

/**
 * Enhanced AWS Polly service with geographic routing and performance optimization
 */
@injectable()
export class PollyService {
    private pollyClient: Polly;
    private readonly config: PollyVoiceConfig;
    private readonly cache: Map<string, { audio: Buffer; timestamp: number }>;
    private readonly circuitBreaker: CircuitBreaker;
    private readonly metrics: Map<string, IMetric[]>;
    private regionLatencies: Map<string, number>;

    constructor(config: PollyVoiceConfig) {
        this.validateConfig(config);
        this.config = config;
        this.cache = new Map();
        this.metrics = new Map();
        this.regionLatencies = new Map();

        // Initialize Polly client with primary region
        this.pollyClient = new Polly({
            region: config.awsRegion,
            credentials: {
                accessKeyId: config.awsCredentials.accessKeyId,
                secretAccessKey: config.awsCredentials.secretAccessKey
            }
        });

        // Configure circuit breaker for API calls
        this.circuitBreaker = new CircuitBreaker(this.synthesizeSpeechInternal.bind(this), {
            timeout: config.performance.maxLatency,
            errorThresholdPercentage: config.performance.errorThreshold,
            resetTimeout: 30000
        });

        this.setupCircuitBreakerEvents();
    }

    /**
     * Enhanced text-to-speech synthesis with performance optimization
     */
    public async synthesizeSpeech(
        text: string,
        voiceId: string = this.config.defaultVoiceId,
        routingOptions?: { preferredRegion?: string; maxLatency?: number }
    ): Promise<Buffer> {
        const startTime = Date.now();
        const cacheKey = this.generateCacheKey(text, voiceId);

        try {
            // Check cache first
            if (this.config.caching.enabled) {
                const cached = this.getCachedAudio(cacheKey);
                if (cached) return cached;
            }

            // Determine optimal region for processing
            const region = await this.determineOptimalRegion(routingOptions);
            
            // Update Polly client region if needed
            if (region !== this.pollyClient.config.region) {
                this.updatePollyClientRegion(region);
            }

            // Synthesize speech with circuit breaker
            const audioData = await this.circuitBreaker.fire(text, voiceId);

            // Cache the result if enabled
            if (this.config.caching.enabled) {
                this.cacheAudio(cacheKey, audioData);
            }

            // Record metrics
            this.recordMetrics({
                type: MetricType.VOICE_LATENCY,
                value: Date.now() - startTime,
                region,
                voiceId
            });

            return audioData;

        } catch (error) {
            this.handleError(error as Error);
            throw error;
        }
    }

    /**
     * Retrieve available voices with caching
     */
    public async getAvailableVoices(region?: string): Promise<Voice[]> {
        const cacheKey = `voices_${region || this.config.awsRegion}`;
        
        try {
            // Check cache
            const cached = this.cache.get(cacheKey);
            if (cached && Date.now() - cached.timestamp < this.config.caching.ttl) {
                return JSON.parse(cached.audio.toString());
            }

            // Update region if specified
            if (region && region !== this.pollyClient.config.region) {
                this.updatePollyClientRegion(region);
            }

            const voices = await this.pollyClient.describeVoices({});
            const filteredVoices = voices.Voices?.filter(voice => 
                voice.SupportedEngines?.includes(this.config.engine)
            ) || [];

            // Cache results
            this.cache.set(cacheKey, {
                audio: Buffer.from(JSON.stringify(filteredVoices)),
                timestamp: Date.now()
            });

            return filteredVoices;

        } catch (error) {
            this.handleError(error as Error);
            throw error;
        }
    }

    /**
     * Retrieve service metrics
     */
    public getMetrics(): IMetric[] {
        const allMetrics: IMetric[] = [];
        this.metrics.forEach(regionMetrics => allMetrics.push(...regionMetrics));
        return allMetrics;
    }

    /**
     * Private helper methods
     */
    private async synthesizeSpeechInternal(text: string, voiceId: string): Promise<Buffer> {
        const command = new SynthesizeSpeechCommand({
            Text: text,
            VoiceId: voiceId,
            Engine: this.config.engine,
            OutputFormat: this.config.compression.enabled ? this.config.compression.format : 'mp3'
        });

        const response = await this.pollyClient.send(command);
        return Buffer.from(await response.AudioStream?.transformToByteArray() || []);
    }

    private async determineOptimalRegion(options?: { preferredRegion?: string; maxLatency?: number }): Promise<string> {
        if (!this.config.geographicRouting.enabled) {
            return this.config.awsRegion;
        }

        // Use preferred region if specified and within latency threshold
        if (options?.preferredRegion) {
            const latency = this.regionLatencies.get(options.preferredRegion);
            if (latency && latency <= (options.maxLatency || this.config.geographicRouting.latencyThreshold)) {
                return options.preferredRegion;
            }
        }

        // Find region with lowest latency
        let optimalRegion = this.config.awsRegion;
        let minLatency = Infinity;

        for (const region of this.config.geographicRouting.regions) {
            const latency = await this.measureRegionLatency(region);
            if (latency < minLatency) {
                minLatency = latency;
                optimalRegion = region;
            }
        }

        return optimalRegion;
    }

    private async measureRegionLatency(region: string): Promise<number> {
        const startTime = Date.now();
        try {
            const testClient = new Polly({ region });
            await testClient.describeVoices({});
            const latency = Date.now() - startTime;
            this.regionLatencies.set(region, latency);
            return latency;
        } catch {
            return Infinity;
        }
    }

    private updatePollyClientRegion(region: string): void {
        this.pollyClient = new Polly({
            region,
            credentials: {
                accessKeyId: this.config.awsCredentials.accessKeyId,
                secretAccessKey: this.config.awsCredentials.secretAccessKey
            }
        });
    }

    private generateCacheKey(text: string, voiceId: string): string {
        return `${voiceId}_${Buffer.from(text).toString('base64')}`;
    }

    private getCachedAudio(key: string): Buffer | null {
        const cached = this.cache.get(key);
        if (cached && Date.now() - cached.timestamp < this.config.caching.ttl) {
            return cached.audio;
        }
        return null;
    }

    private cacheAudio(key: string, audio: Buffer): void {
        // Implement LRU cache eviction if needed
        if (this.cache.size >= this.config.caching.maxSize) {
            const oldestKey = this.cache.keys().next().value;
            this.cache.delete(oldestKey);
        }
        this.cache.set(key, { audio, timestamp: Date.now() });
    }

    private recordMetrics(metric: { type: MetricType; value: number; region: string; voiceId: string }): void {
        const metricData: IMetric = {
            id: crypto.randomUUID(),
            name: 'polly_synthesis',
            type: metric.type,
            value: metric.value,
            unit: MetricUnit.MILLISECONDS,
            timestamp: new Date(),
            service: 'polly-service',
            environment: process.env.NODE_ENV || 'development',
            metadata: {
                region: metric.region,
                voiceId: metric.voiceId
            },
            tags: {
                operation: 'synthesis',
                region: metric.region
            }
        };

        const regionMetrics = this.metrics.get(metric.region) || [];
        regionMetrics.push(metricData);
        this.metrics.set(metric.region, regionMetrics);
    }

    private validateConfig(config: PollyVoiceConfig): void {
        if (!config.awsCredentials?.accessKeyId || !config.awsCredentials?.secretAccessKey) {
            throw new Error('Invalid AWS credentials configuration');
        }
        if (!config.awsRegion) {
            throw new Error('Invalid AWS region configuration');
        }
        if (config.geographicRouting.enabled && (!config.geographicRouting.regions || config.geographicRouting.regions.length === 0)) {
            throw new Error('Invalid geographic routing configuration');
        }
    }

    private setupCircuitBreakerEvents(): void {
        this.circuitBreaker.on('success', () => {
            console.log('Circuit breaker: successful call');
        });
        this.circuitBreaker.on('timeout', () => {
            console.warn('Circuit breaker: timeout');
        });
        this.circuitBreaker.on('reject', () => {
            console.warn('Circuit breaker: rejected request');
        });
        this.circuitBreaker.on('open', () => {
            console.warn('Circuit breaker: opened');
        });
        this.circuitBreaker.on('close', () => {
            console.log('Circuit breaker: closed');
        });
    }

    private handleError(error: Error): void {
        console.error('Polly service error:', error);
        // Implement error reporting/monitoring here
        throw error;
    }
}