import { injectable } from 'inversify'; // v6.0.1
import { Logger } from 'winston'; // v3.8.0
import { CircuitBreaker } from 'opossum'; // v6.0.0
import { WhisperService } from '../../../ai/services/whisper.service';
import { Call } from '../models/call.model';
import { IMetric, MetricType, MetricUnit } from '../../../common/interfaces/metric.interface';

/**
 * Enhanced configuration options for voice recognition with geographic routing
 */
export interface IRecognitionOptions {
    language: string;
    model: string;
    minConfidence: number;
    region: string;
    cacheEnabled: boolean;
    retryAttempts: number;
    timeoutMs: number;
}

/**
 * Enhanced service handling voice recognition and transcription for autonomous calls
 * with geographic routing and performance optimization
 */
@injectable()
export class RecognitionService {
    private readonly metrics: Map<string, IMetric[]> = new Map();
    private readonly cache: Map<string, { text: string; timestamp: number }> = new Map();
    private readonly CACHE_TTL = 3600000; // 1 hour
    private readonly DEFAULT_OPTIONS: Partial<IRecognitionOptions> = {
        minConfidence: 0.85,
        cacheEnabled: true,
        retryAttempts: 3,
        timeoutMs: 200 // 200ms RTT target
    };

    constructor(
        private readonly whisperService: WhisperService,
        private readonly logger: Logger,
        private readonly circuitBreaker: CircuitBreaker
    ) {
        this.initializeCircuitBreaker();
    }

    /**
     * Processes real-time voice data for transcription with geographic routing
     * and performance optimization
     */
    public async recognizeVoice(
        audioData: Buffer,
        call: Call,
        options: Partial<IRecognitionOptions>
    ): Promise<string> {
        const startTime = Date.now();
        const requestId = crypto.randomUUID();
        const mergedOptions = { ...this.DEFAULT_OPTIONS, ...options };

        try {
            // Validate audio data
            this.validateAudioData(audioData);

            // Check cache if enabled
            if (mergedOptions.cacheEnabled) {
                const cachedResult = this.checkCache(audioData);
                if (cachedResult) {
                    this.recordMetric('cache_hit', 1, call.region);
                    return cachedResult.text;
                }
            }

            // Get optimal regional endpoint
            const processingRegion = await this.whisperService.getRegionalEndpoint({
                preferredRegion: mergedOptions.region || call.region,
                maxLatency: mergedOptions.timeoutMs
            });

            // Process transcription through circuit breaker
            const transcriptionResult = await this.circuitBreaker.fire(async () => {
                const result = await this.whisperService.transcribeAudio(audioData, {
                    language: mergedOptions.language,
                    model: mergedOptions.model,
                    preferredRegion: processingRegion,
                    cacheEnabled: mergedOptions.cacheEnabled,
                    retryConfig: {
                        maxAttempts: mergedOptions.retryAttempts,
                        backoffMs: 1000
                    }
                });

                // Validate confidence threshold
                if (result.confidence < mergedOptions.minConfidence) {
                    throw new Error(`Confidence below threshold: ${result.confidence}`);
                }

                return result;
            });

            // Update call with transcription and metrics
            await this.updateCallWithResult(call, transcriptionResult, startTime, processingRegion);

            // Cache successful result if enabled
            if (mergedOptions.cacheEnabled) {
                this.cacheResult(audioData, transcriptionResult.text);
            }

            return transcriptionResult.text;

        } catch (error) {
            this.handleError(error as Error, call, requestId);
            throw error;
        }
    }

    /**
     * Retrieves comprehensive recognition service performance metrics
     * with regional data
     */
    public async getMetrics(
        region?: string,
        timeRange?: { start: Date; end: Date }
    ): Promise<IMetric[]> {
        // Get Whisper service metrics
        const whisperMetrics = await this.whisperService.getMetrics(timeRange);

        // Combine with recognition service metrics
        const recognitionMetrics = Array.from(this.metrics.values())
            .flat()
            .filter(metric => {
                const matchesRegion = !region || metric.metadata.region === region;
                const matchesTimeRange = !timeRange || 
                    (metric.timestamp >= timeRange.start && metric.timestamp <= timeRange.end);
                return matchesRegion && matchesTimeRange;
            });

        return [...whisperMetrics, ...recognitionMetrics];
    }

    /**
     * Private helper methods
     */
    private initializeCircuitBreaker(): void {
        this.circuitBreaker.on('open', () => {
            this.logger.warn('Recognition circuit breaker opened');
        });

        this.circuitBreaker.on('halfOpen', () => {
            this.logger.info('Recognition circuit breaker half-opened');
        });

        this.circuitBreaker.on('close', () => {
            this.logger.info('Recognition circuit breaker closed');
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

    private checkCache(audioData: Buffer): { text: string; timestamp: number } | null {
        const audioHash = this.calculateAudioHash(audioData);
        const cached = this.cache.get(audioHash);

        if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
            return cached;
        }

        return null;
    }

    private cacheResult(audioData: Buffer, text: string): void {
        const audioHash = this.calculateAudioHash(audioData);
        this.cache.set(audioHash, { text, timestamp: Date.now() });
    }

    private calculateAudioHash(audioData: Buffer): string {
        return crypto.createHash('sha256').update(audioData).digest('hex');
    }

    private async updateCallWithResult(
        call: Call,
        result: any,
        startTime: number,
        region: string
    ): Promise<void> {
        // Update call transcription
        await call.updateTranscription(result.text);

        // Record performance metrics
        const processingTime = Date.now() - startTime;
        
        const metric: IMetric = {
            id: crypto.randomUUID(),
            name: 'voice_recognition',
            type: MetricType.VOICE_LATENCY,
            value: processingTime,
            unit: MetricUnit.MILLISECONDS,
            timestamp: new Date(),
            service: 'recognition-service',
            environment: process.env.NODE_ENV || 'development',
            metadata: {
                region,
                confidence: result.confidence,
                model: result.model
            },
            tags: {
                operation: 'recognition',
                callId: call.id
            }
        };

        // Add metric to call and service metrics
        call.addMetric(metric);
        this.recordMetric('processing_time', processingTime, region);
    }

    private recordMetric(name: string, value: number, region: string): void {
        const metric: IMetric = {
            id: crypto.randomUUID(),
            name,
            type: MetricType.VOICE_LATENCY,
            value,
            unit: MetricUnit.MILLISECONDS,
            timestamp: new Date(),
            service: 'recognition-service',
            environment: process.env.NODE_ENV || 'development',
            metadata: { region },
            tags: { operation: 'recognition' }
        };

        const regionMetrics = this.metrics.get(region) || [];
        regionMetrics.push(metric);
        this.metrics.set(region, regionMetrics);
    }

    private handleError(error: Error, call: Call, requestId: string): void {
        this.logger.error('Recognition error:', {
            requestId,
            callId: call.id,
            region: call.region,
            error: error.message,
            timestamp: new Date().toISOString()
        });

        this.recordMetric('error_count', 1, call.region);
        call.addMetric({
            id: crypto.randomUUID(),
            name: 'recognition_error',
            type: MetricType.ERROR_RATE,
            value: 1,
            unit: MetricUnit.COUNT,
            timestamp: new Date(),
            service: 'recognition-service',
            environment: process.env.NODE_ENV || 'development',
            metadata: {
                error: error.message,
                region: call.region
            },
            tags: {
                operation: 'recognition',
                callId: call.id
            }
        });
    }
}