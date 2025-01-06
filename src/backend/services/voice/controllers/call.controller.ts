import { injectable } from 'inversify'; // v6.0.1
import { Controller, Post, Get, UseCircuitBreaker } from '@nestjs/common'; // v10.0.0
import { Logger } from 'winston'; // v3.8.0
import { CircuitBreaker } from 'opossum'; // v6.0.0

import { Call, CallStatus } from '../models/call.model';
import { SynthesisService, ISynthesisOptions } from '../services/synthesis.service';
import { RecognitionService, IRecognitionOptions } from '../services/recognition.service';
import { IMetric, MetricType, MetricUnit } from '../../../common/interfaces/metric.interface';

/**
 * Interface for geographic routing configuration
 */
interface IGeographicConfig {
    preferredRegion?: string;
    maxLatency?: number;
    failoverEnabled?: boolean;
    routingStrategy?: 'nearest' | 'performance' | 'round-robin';
}

/**
 * Interface for enhanced call metrics
 */
interface IEnhancedMetrics {
    rttLatency: number;
    processingTime: number;
    geographicData: {
        region: string;
        latency: number;
        routingPath: string[];
    };
    quality: {
        audioQuality: number;
        transcriptionConfidence: number;
        voiceClarity: number;
    };
}

/**
 * Interface for call initialization
 */
interface ICallInit {
    phoneNumber: string;
    campaignId: string;
    leadId: string;
    region?: string;
    voiceId?: string;
    language?: string;
}

/**
 * Interface for stream processing response
 */
interface IStreamResponse {
    success: boolean;
    audioData?: Buffer;
    transcription?: string;
    metrics: IEnhancedMetrics;
}

/**
 * Enhanced controller for voice call operations with geographic routing
 * and performance optimization
 */
@injectable()
@Controller('voice/calls')
export class CallController {
    private readonly logger: Logger;
    private readonly DEFAULT_LATENCY_THRESHOLD = 200; // 200ms RTT target
    private readonly QUALITY_THRESHOLD = 0.85;

    constructor(
        private readonly synthesisService: SynthesisService,
        private readonly recognitionService: RecognitionService,
        private readonly circuitBreaker: CircuitBreaker
    ) {
        this.initializeLogger();
        this.setupCircuitBreaker();
    }

    /**
     * Initiates a new outbound call with geographic optimization
     */
    @Post()
    @UseCircuitBreaker()
    public async initiateCall(
        callInit: ICallInit,
        geoConfig?: IGeographicConfig
    ): Promise<Call> {
        const startTime = Date.now();
        const requestId = crypto.randomUUID();

        try {
            // Determine optimal processing region
            const processingRegion = await this.synthesisService.getRegionalEndpoint({
                preferredRegion: geoConfig?.preferredRegion || callInit.region,
                maxLatency: geoConfig?.maxLatency || this.DEFAULT_LATENCY_THRESHOLD
            });

            // Initialize call with geographic routing
            const call = new Call({
                ...callInit,
                region: processingRegion,
                isEncrypted: true
            });

            // Configure synthesis options
            const synthesisOptions: ISynthesisOptions = {
                voiceId: callInit.voiceId || 'default',
                engine: 'neural',
                language: callInit.language || 'en-US',
                quality: 'high',
                cacheEnabled: true,
                compressionLevel: 0,
                region: processingRegion
            };

            // Initialize voice synthesis
            await this.synthesisService.synthesize('Initializing call...', synthesisOptions);

            // Record initialization metrics
            const initializationTime = Date.now() - startTime;
            this.recordMetric(call, 'initialization', initializationTime, processingRegion);

            return call;

        } catch (error) {
            this.handleError(error as Error, requestId);
            throw error;
        }
    }

    /**
     * Ends an active call with comprehensive metrics collection
     */
    @Post(':id/end')
    @UseCircuitBreaker()
    public async endCall(callId: string): Promise<Call> {
        const requestId = crypto.randomUUID();

        try {
            // Retrieve call instance
            const call = await Call.findById(callId);
            if (!call) {
                throw new Error(`Call not found: ${callId}`);
            }

            // Collect final metrics
            const metrics = await this.getCallMetrics(callId);
            call.addMetric({
                id: crypto.randomUUID(),
                name: 'call_completion',
                type: MetricType.VOICE_LATENCY,
                value: call.duration,
                unit: MetricUnit.MILLISECONDS,
                timestamp: new Date(),
                service: 'call-controller',
                environment: process.env.NODE_ENV || 'development',
                metadata: {
                    region: call.region,
                    metrics
                },
                tags: {
                    operation: 'end_call',
                    callId
                }
            });

            // Update call status
            await call.updateStatus(CallStatus.COMPLETED);

            return call;

        } catch (error) {
            this.handleError(error as Error, requestId);
            throw error;
        }
    }

    /**
     * Retrieves detailed call performance metrics including geographic data
     */
    @Get(':id/metrics')
    public async getCallMetrics(callId: string): Promise<IEnhancedMetrics> {
        const call = await Call.findById(callId);
        if (!call) {
            throw new Error(`Call not found: ${callId}`);
        }

        // Collect synthesis metrics
        const synthesisMetrics = await this.synthesisService.getMetrics();
        
        // Collect recognition metrics
        const recognitionMetrics = await this.recognitionService.getMetrics(
            call.region,
            {
                start: call.startTime,
                end: call.endTime || new Date()
            }
        );

        // Calculate aggregate metrics
        return {
            rttLatency: call.rttLatency,
            processingTime: call.duration,
            geographicData: {
                region: call.region,
                latency: call.geoMetadata.latency,
                routingPath: call.geoMetadata.routingPath
            },
            quality: {
                audioQuality: this.calculateAudioQuality(synthesisMetrics),
                transcriptionConfidence: this.calculateTranscriptionConfidence(recognitionMetrics),
                voiceClarity: this.calculateVoiceClarity(synthesisMetrics)
            }
        };
    }

    /**
     * Processes real-time voice stream data with geographic optimization
     */
    @Post(':id/stream')
    @UseCircuitBreaker()
    public async processVoiceStream(
        callId: string,
        audioData: Buffer,
        geoMetrics?: IGeographicConfig
    ): Promise<IStreamResponse> {
        const startTime = Date.now();
        const requestId = crypto.randomUUID();

        try {
            // Retrieve call instance
            const call = await Call.findById(callId);
            if (!call) {
                throw new Error(`Call not found: ${callId}`);
            }

            // Process voice recognition
            const recognitionResult = await this.recognitionService.recognizeVoice(
                audioData,
                call,
                {
                    language: call.language,
                    model: 'whisper-1',
                    region: call.region,
                    cacheEnabled: true,
                    retryAttempts: 2,
                    timeoutMs: this.DEFAULT_LATENCY_THRESHOLD
                }
            );

            // Generate AI response
            const synthesisResponse = await this.synthesisService.synthesize(
                recognitionResult,
                {
                    voiceId: call.voiceId,
                    engine: 'neural',
                    quality: 'high',
                    region: call.region,
                    cacheEnabled: true
                }
            );

            // Record stream processing metrics
            const processingTime = Date.now() - startTime;
            this.recordMetric(call, 'stream_processing', processingTime, call.region);

            return {
                success: true,
                audioData: synthesisResponse.audioStream,
                transcription: recognitionResult,
                metrics: {
                    rttLatency: processingTime,
                    processingTime,
                    geographicData: {
                        region: call.region,
                        latency: call.geoMetadata.latency,
                        routingPath: call.geoMetadata.routingPath
                    },
                    quality: {
                        audioQuality: synthesisResponse.quality.clarity,
                        transcriptionConfidence: 0.95,
                        voiceClarity: synthesisResponse.quality.naturalness
                    }
                }
            };

        } catch (error) {
            this.handleError(error as Error, requestId);
            throw error;
        }
    }

    /**
     * Private helper methods
     */
    private initializeLogger(): void {
        // Initialize Winston logger with appropriate configuration
    }

    private setupCircuitBreaker(): void {
        this.circuitBreaker.fallback(async () => {
            throw new Error('Voice service is currently unavailable');
        });

        this.circuitBreaker.on('success', () => {
            this.logger.info('Circuit breaker: successful operation');
        });

        this.circuitBreaker.on('timeout', () => {
            this.logger.warn('Circuit breaker: operation timeout');
        });
    }

    private recordMetric(
        call: Call,
        operation: string,
        value: number,
        region: string
    ): void {
        const metric: IMetric = {
            id: crypto.randomUUID(),
            name: `voice_${operation}`,
            type: MetricType.VOICE_LATENCY,
            value,
            unit: MetricUnit.MILLISECONDS,
            timestamp: new Date(),
            service: 'call-controller',
            environment: process.env.NODE_ENV || 'development',
            metadata: { region },
            tags: {
                operation,
                callId: call.id
            }
        };

        call.addMetric(metric);
    }

    private calculateAudioQuality(metrics: IMetric[]): number {
        return metrics
            .filter(m => m.name === 'audio_quality')
            .reduce((acc, m) => acc + m.value, 0) / metrics.length || 0;
    }

    private calculateTranscriptionConfidence(metrics: IMetric[]): number {
        return metrics
            .filter(m => m.name === 'transcription_confidence')
            .reduce((acc, m) => acc + m.value, 0) / metrics.length || 0;
    }

    private calculateVoiceClarity(metrics: IMetric[]): number {
        return metrics
            .filter(m => m.name === 'voice_clarity')
            .reduce((acc, m) => acc + m.value, 0) / metrics.length || 0;
    }

    private handleError(error: Error, requestId: string): void {
        this.logger.error('Call controller error:', {
            requestId,
            error: error.message,
            timestamp: new Date().toISOString()
        });
        throw error;
    }
}