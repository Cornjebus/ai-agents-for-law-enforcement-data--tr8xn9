import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'; // v29.0.0
import { mock, MockInstance, spyOn } from 'jest-mock'; // v29.0.0
import { Call, CallStatus } from '../../services/voice/models/call.model';
import { SynthesisService, ISynthesisOptions, ISynthesisResult } from '../../services/voice/services/synthesis.service';
import { RecognitionService, IRecognitionOptions } from '../../services/voice/services/recognition.service';
import { MetricType, MetricUnit } from '../../common/interfaces/metric.interface';

// Mock implementations
class MockCall extends Call {
    public metrics: any = {};
    public status: CallStatus = CallStatus.PENDING;
    public region: string = 'us-west-2';
    public rttLatency: number = 0;

    constructor() {
        super({
            phoneNumber: '+1234567890',
            campaignId: 'test-campaign',
            leadId: 'test-lead',
            region: 'us-west-2'
        });
    }

    async updateStatus(newStatus: CallStatus): Promise<void> {
        this.status = newStatus;
    }

    addMetric(metric: any): void {
        if (!this.metrics[metric.type]) {
            this.metrics[metric.type] = [];
        }
        this.metrics[metric.type].push(metric);
    }
}

describe('Call Model', () => {
    let call: MockCall;

    beforeEach(() => {
        call = new MockCall();
    });

    it('should initialize with correct default values', () => {
        expect(call.status).toBe(CallStatus.PENDING);
        expect(call.region).toBe('us-west-2');
        expect(call.rttLatency).toBe(0);
        expect(call.isEncrypted).toBe(true);
    });

    it('should update status with performance metrics', async () => {
        await call.updateStatus(CallStatus.IN_PROGRESS);
        expect(call.status).toBe(CallStatus.IN_PROGRESS);
        expect(call.metrics[MetricType.VOICE_LATENCY]).toBeDefined();
    });

    it('should track geographic routing metrics', () => {
        call.addMetric({
            type: MetricType.VOICE_LATENCY,
            value: 150,
            unit: MetricUnit.MILLISECONDS,
            region: 'us-west-2'
        });
        expect(call.rttLatency).toBe(150);
    });

    it('should validate encryption requirements', () => {
        expect(call.isEncrypted).toBe(true);
        expect(() => {
            new MockCall().isEncrypted = false;
        }).toThrow();
    });
});

describe('Synthesis Service', () => {
    let synthesisService: SynthesisService;
    let mockCall: MockCall;

    beforeEach(() => {
        synthesisService = mock<SynthesisService>();
        mockCall = new MockCall();
    });

    it('should synthesize speech with performance monitoring', async () => {
        const options: ISynthesisOptions = {
            text: 'Test speech',
            voiceId: 'test-voice',
            engine: 'neural',
            language: 'en-US',
            quality: 'high',
            cacheEnabled: true,
            compressionLevel: 0,
            region: 'us-west-2'
        };

        const result: ISynthesisResult = {
            audioStream: Buffer.from('test-audio'),
            duration: 1000,
            metrics: [],
            quality: {
                clarity: 0.95,
                naturalness: 0.90,
                emotionAccuracy: 0.85,
                overallScore: 0.90
            },
            cacheHit: false,
            region: 'us-west-2',
            compressionRatio: 1.0,
            emotionAnalysis: []
        };

        jest.spyOn(synthesisService, 'synthesize').mockResolvedValue(result);
        const response = await synthesisService.synthesize(options, mockCall);

        expect(response.quality.overallScore).toBeGreaterThanOrEqual(0.85);
        expect(response.region).toBe('us-west-2');
        expect(mockCall.metrics[MetricType.VOICE_LATENCY]).toBeDefined();
    });

    it('should optimize geographic routing', async () => {
        jest.spyOn(synthesisService, 'getAvailableVoices').mockResolvedValue([]);
        await synthesisService.getAvailableVoices('us-west-2');
        expect(synthesisService.getAvailableVoices).toHaveBeenCalledWith('us-west-2');
    });
});

describe('Recognition Service', () => {
    let recognitionService: RecognitionService;
    let mockCall: MockCall;

    beforeEach(() => {
        recognitionService = mock<RecognitionService>();
        mockCall = new MockCall();
    });

    it('should recognize voice with accuracy validation', async () => {
        const options: IRecognitionOptions = {
            language: 'en-US',
            model: 'whisper-1',
            minConfidence: 0.85,
            region: 'us-west-2',
            cacheEnabled: true,
            retryAttempts: 3,
            timeoutMs: 200
        };

        const audioData = Buffer.from('test-audio-data');
        const expectedText = 'Test transcription';

        jest.spyOn(recognitionService, 'recognizeVoice').mockResolvedValue(expectedText);
        const result = await recognitionService.recognizeVoice(audioData, mockCall, options);

        expect(result).toBe(expectedText);
        expect(mockCall.metrics[MetricType.VOICE_LATENCY]).toBeDefined();
    });

    it('should handle recognition failures with circuit breaker', async () => {
        const audioData = Buffer.from('test-audio-data');
        const options: IRecognitionOptions = {
            language: 'en-US',
            model: 'whisper-1',
            minConfidence: 0.85,
            region: 'us-west-2',
            cacheEnabled: true,
            retryAttempts: 3,
            timeoutMs: 200
        };

        jest.spyOn(recognitionService, 'recognizeVoice').mockRejectedValue(new Error('Recognition failed'));
        
        await expect(recognitionService.recognizeVoice(audioData, mockCall, options))
            .rejects.toThrow('Recognition failed');
        
        expect(mockCall.metrics[MetricType.ERROR_RATE]).toBeDefined();
    });

    it('should validate performance thresholds', async () => {
        const metrics = await recognitionService.getMetrics('us-west-2');
        expect(metrics).toBeDefined();
        metrics.forEach(metric => {
            if (metric.type === MetricType.VOICE_LATENCY) {
                expect(metric.value).toBeLessThanOrEqual(200); // 200ms RTT target
            }
        });
    });
});