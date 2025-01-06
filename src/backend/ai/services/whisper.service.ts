import { injectable } from 'inversify';
import { Configuration, OpenAIApi } from 'openai';
import { retry } from 'retry-ts';
import { caching } from 'cache-manager';
import { VoiceModel, VoiceConfig, VoiceQuality } from '../models/voice';
import { IMetric, MetricType, MetricUnit } from '../../common/interfaces/metric.interface';

/**
 * Enhanced configuration options for Whisper transcription
 */
export interface TranscriptionOptions {
    language?: string;
    model: string;
    prompt?: string;
    temperature?: number;
    preferredRegion?: string;
    priority: 'high' | 'normal' | 'low';
    cacheEnabled: boolean;
    retryConfig?: {
        maxAttempts: number;
        backoffMs: number;
    };
}

/**
 * Enhanced transcription result with detailed metadata
 */
export interface TranscriptionResult {
    text: string;
    confidence: number;
    processingTime: number;
    region: string;
    model: string;
    cached: boolean;
    segments?: Array<{
        start: number;
        end: number;
        text: string;
        confidence: number;
    }>;
    metadata: {
        audioQuality: number;
        background: 'quiet' | 'noisy' | 'very_noisy';
        speakerCount?: number;
    };
}

/**
 * High-performance Whisper service implementation with geographic routing
 * and optimized voice processing capabilities
 */
@injectable()
export class WhisperService {
    private readonly openaiClient: OpenAIApi;
    private readonly voiceModel: VoiceModel;
    private readonly cache: any; // Type from cache-manager
    private readonly metricsCollection: Map<string, IMetric[]>;
    private readonly defaultRetryConfig = {
        maxAttempts: 3,
        backoffMs: 1000,
    };

    constructor(
        private readonly config: VoiceConfig,
        private readonly apiKey: string
    ) {
        // Initialize OpenAI client with configuration
        const configuration = new Configuration({
            apiKey: this.apiKey,
            baseOptions: {
                timeout: 30000,
                maxContentLength: Infinity,
            },
        });
        this.openaiClient = new OpenAIApi(configuration);

        // Initialize voice model with geographic routing
        this.voiceModel = new VoiceModel(config);

        // Initialize metrics collection
        this.metricsCollection = new Map();

        // Initialize cache with TTL
        this.initializeCache();
    }

    /**
     * Transcribes audio data to text using Whisper model with performance optimization
     */
    public async transcribeAudio(
        audioData: Buffer,
        options: TranscriptionOptions
    ): Promise<TranscriptionResult> {
        const startTime = Date.now();
        const requestId = crypto.randomUUID();

        try {
            // Check cache if enabled
            if (options.cacheEnabled) {
                const cachedResult = await this.checkCache(audioData);
                if (cachedResult) {
                    this.recordMetric('cache_hit', 1, options.preferredRegion);
                    return {
                        ...cachedResult,
                        cached: true,
                        processingTime: Date.now() - startTime,
                    };
                }
            }

            // Validate audio data
            this.validateAudioData(audioData);

            // Determine optimal processing region
            const processingRegion = await this.voiceModel.determineOptimalRegion({
                preferredRegion: options.preferredRegion,
                maxLatency: 200, // 200ms RTT target
            });

            // Configure retry mechanism
            const retryConfig = options.retryConfig || this.defaultRetryConfig;
            const retryOperation = retry(retryConfig.maxAttempts, retryConfig.backoffMs);

            // Process transcription with retries
            const result = await retryOperation.execute(async () => {
                const response = await this.openaiClient.createTranscription(
                    audioData,
                    options.model,
                    options.prompt,
                    options.language,
                    options.temperature,
                    {
                        region: processingRegion,
                    }
                );

                return this.processTranscriptionResponse(response.data, processingRegion);
            });

            // Cache successful result if enabled
            if (options.cacheEnabled) {
                await this.cacheResult(audioData, result);
            }

            // Record performance metrics
            const processingTime = Date.now() - startTime;
            this.recordMetric('processing_time', processingTime, processingRegion);
            this.recordMetric('success_count', 1, processingRegion);

            return {
                ...result,
                processingTime,
                cached: false,
            };

        } catch (error) {
            this.handleTranscriptionError(error, requestId, options.preferredRegion);
            throw error;
        }
    }

    /**
     * Retrieves comprehensive Whisper service performance metrics
     */
    public async getMetrics(timeRange?: { start: Date; end: Date }): Promise<IMetric[]> {
        const metrics: IMetric[] = [];
        
        this.metricsCollection.forEach((regionMetrics, region) => {
            const filteredMetrics = timeRange 
                ? regionMetrics.filter(m => 
                    m.timestamp >= timeRange.start && m.timestamp <= timeRange.end)
                : regionMetrics;

            metrics.push(...filteredMetrics);
        });

        return metrics;
    }

    /**
     * Private helper methods
     */
    private async initializeCache(): Promise<void> {
        this.cache = await caching('memory', {
            max: 1000,
            ttl: 3600000, // 1 hour
        });
    }

    private validateAudioData(audioData: Buffer): void {
        if (!audioData || audioData.length === 0) {
            throw new Error('Invalid audio data');
        }
        if (audioData.length > 25 * 1024 * 1024) { // 25MB limit
            throw new Error('Audio file too large');
        }
    }

    private async checkCache(audioData: Buffer): Promise<TranscriptionResult | null> {
        const audioHash = this.calculateAudioHash(audioData);
        return this.cache.get(audioHash);
    }

    private async cacheResult(audioData: Buffer, result: TranscriptionResult): Promise<void> {
        const audioHash = this.calculateAudioHash(audioData);
        await this.cache.set(audioHash, result);
    }

    private calculateAudioHash(audioData: Buffer): string {
        return crypto.createHash('sha256').update(audioData).digest('hex');
    }

    private processTranscriptionResponse(
        response: any,
        region: string
    ): TranscriptionResult {
        return {
            text: response.text,
            confidence: response.confidence || 0.95,
            region,
            model: response.model,
            cached: false,
            segments: response.segments,
            metadata: {
                audioQuality: response.audio_quality || 0.8,
                background: response.background_noise_level || 'quiet',
                speakerCount: response.speaker_count,
            },
            processingTime: 0, // Will be set by caller
        };
    }

    private recordMetric(
        name: string,
        value: number,
        region: string
    ): void {
        const metric: IMetric = {
            id: crypto.randomUUID(),
            name,
            type: MetricType.VOICE_LATENCY,
            value,
            unit: MetricUnit.MILLISECONDS,
            timestamp: new Date(),
            service: 'whisper-service',
            environment: process.env.NODE_ENV || 'development',
            metadata: { region },
            tags: { operation: 'transcription' }
        };

        const regionMetrics = this.metricsCollection.get(region) || [];
        regionMetrics.push(metric);
        this.metricsCollection.set(region, regionMetrics);
    }

    private handleTranscriptionError(
        error: any,
        requestId: string,
        region?: string
    ): void {
        this.recordMetric('error_count', 1, region || 'unknown');
        
        console.error('Transcription error:', {
            requestId,
            region,
            error: error.message,
            timestamp: new Date().toISOString(),
        });
    }
}