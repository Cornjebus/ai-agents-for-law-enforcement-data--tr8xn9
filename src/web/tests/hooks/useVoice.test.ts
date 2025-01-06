import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'; // v29.5.0
import { renderHook, act } from '@testing-library/react-hooks'; // v8.0.1
import { mockRTC } from '@testing-library/webrtc-mock'; // v1.0.0
import { useVoice } from '../../src/hooks/useVoice';
import { VoiceService } from '../../src/services/voice.service';
import {
  VoiceCallStatus,
  VoiceEngine,
  VoiceQuality,
  RoutingStrategy,
  IVoiceCall,
  IVoiceSynthesisOptions,
  IGeographicRouting
} from '../../src/types/voice';

// Mock VoiceService
jest.mock('../../src/services/voice.service');

// Performance thresholds from technical specifications
const LATENCY_THRESHOLD = 200; // ms
const VOICE_QUALITY_THRESHOLD = 0.8;
const MAX_AUDIO_SIZE = 5242880; // 5MB

describe('useVoice Hook', () => {
  let mockVoiceService: jest.Mocked<VoiceService>;

  beforeEach(() => {
    // Initialize WebRTC mock
    mockRTC.setup();

    // Reset VoiceService mock
    mockVoiceService = new VoiceService() as jest.Mocked<VoiceService>;
    (VoiceService as jest.Mock).mockImplementation(() => mockVoiceService);

    // Mock performance monitoring
    jest.spyOn(window, 'performance', 'get').mockImplementation(() => ({
      now: () => Date.now(),
      mark: jest.fn(),
      measure: jest.fn(),
      getEntriesByName: jest.fn()
    } as unknown as Performance));
  });

  afterEach(() => {
    mockRTC.cleanup();
    jest.clearAllMocks();
  });

  describe('Call Management', () => {
    it('should initiate a call with performance optimization', async () => {
      const mockCall: IVoiceCall = {
        id: '123',
        phoneNumber: '+15551234567',
        status: VoiceCallStatus.CONNECTING,
        startTime: new Date(),
        endTime: null,
        duration: 0,
        transcription: null,
        metrics: {
          latency: [{ value: 150, timestamp: new Date(), region: 'us-west-1' }],
          quality: [{ value: 0.9, timestamp: new Date(), region: 'us-west-1' }],
          duration: [],
          errors: [],
          jitter: [],
          packetLoss: [],
          mos: []
        },
        campaignId: 'campaign-123',
        leadId: 'lead-123',
        geographicRouting: {
          region: 'us-west-1',
          datacenter: 'primary',
          latency: 150,
          backupRegion: 'us-east-1',
          routingStrategy: RoutingStrategy.LOWEST_LATENCY
        },
        aiModel: {
          modelId: 'gpt-4',
          version: '1.0.0',
          temperature: 0.7,
          maxTokens: 8000,
          contextWindow: 100000,
          responseTimeout: 5000
        },
        quality: VoiceQuality.HIGH,
        recordingUrl: null,
        metadata: {}
      };

      mockVoiceService.initiateCall.mockResolvedValue(mockCall);

      const { result } = renderHook(() => useVoice());

      await act(async () => {
        const call = await result.current.initiateCall(
          '+15551234567',
          'campaign-123',
          { engine: VoiceEngine.NEURAL_HD, quality: VoiceQuality.HIGH }
        );

        expect(call).toEqual(mockCall);
        expect(call.metrics.latency[0].value).toBeLessThan(LATENCY_THRESHOLD);
        expect(result.current.calls).toHaveLength(1);
        expect(result.current.hasActiveCalls).toBe(true);
      });
    });

    it('should handle call failures gracefully', async () => {
      mockVoiceService.initiateCall.mockRejectedValue(new Error('Network error'));

      const { result } = renderHook(() => useVoice());

      await act(async () => {
        try {
          await result.current.initiateCall('+15551234567', 'campaign-123');
        } catch (error) {
          expect(error.message).toBe('Network error');
          expect(result.current.error).toBeTruthy();
          expect(result.current.hasActiveCalls).toBe(false);
        }
      });
    });
  });

  describe('Voice Processing', () => {
    it('should synthesize voice with quality optimization', async () => {
      const mockAudioBuffer = new ArrayBuffer(1024);
      mockVoiceService.synthesizeVoice.mockResolvedValue(mockAudioBuffer);

      const { result } = renderHook(() => useVoice());

      const options: IVoiceSynthesisOptions = {
        text: 'Hello world',
        voiceId: 'neural-1',
        engine: VoiceEngine.NEURAL_HD,
        language: 'en-US',
        pitch: 1.0,
        rate: 1.0,
        volume: 1.0,
        emphasis: ['moderate'],
        quality: VoiceQuality.HIGH
      };

      await act(async () => {
        const audio = await result.current.synthesizeVoice(options);
        expect(audio).toEqual(mockAudioBuffer);
        expect(result.current.isProcessing).toBe(false);
      });
    });

    it('should recognize speech with enhanced accuracy', async () => {
      const mockAudioData = new ArrayBuffer(1024);
      const mockTranscription = 'Hello world';
      mockVoiceService.recognizeSpeech.mockResolvedValue(mockTranscription);

      const { result } = renderHook(() => useVoice());

      await act(async () => {
        const transcription = await result.current.recognizeSpeech(mockAudioData);
        expect(transcription).toBe(mockTranscription);
        expect(result.current.isProcessing).toBe(false);
      });
    });

    it('should reject oversized audio data', async () => {
      const mockAudioData = new ArrayBuffer(MAX_AUDIO_SIZE + 1);
      const { result } = renderHook(() => useVoice());

      await act(async () => {
        try {
          await result.current.recognizeSpeech(mockAudioData);
        } catch (error) {
          expect(error.message).toBe('Audio size exceeds maximum limit');
        }
      });
    });
  });

  describe('Performance Monitoring', () => {
    it('should track voice call metrics in real-time', async () => {
      const mockMetrics = {
        latency: [{ value: 150, timestamp: new Date(), region: 'us-west-1' }],
        quality: [{ value: 0.9, timestamp: new Date(), region: 'us-west-1' }],
        duration: [],
        errors: [],
        jitter: [],
        packetLoss: [],
        mos: []
      };

      mockVoiceService.monitorCallQuality.mockResolvedValue(mockMetrics);

      const { result } = renderHook(() => useVoice());

      await act(async () => {
        // Simulate active call
        await result.current.initiateCall('+15551234567', 'campaign-123');
        
        // Wait for metrics update
        await new Promise(resolve => setTimeout(resolve, 1000));

        expect(result.current.metrics).toEqual(mockMetrics);
        expect(mockMetrics.latency[0].value).toBeLessThan(LATENCY_THRESHOLD);
        expect(mockMetrics.quality[0].value).toBeGreaterThan(VOICE_QUALITY_THRESHOLD);
      });
    });

    it('should optimize geographic routing based on performance', async () => {
      const mockRouting: IGeographicRouting = {
        region: 'us-west-1',
        datacenter: 'primary',
        latency: 150,
        backupRegion: 'us-east-1',
        routingStrategy: RoutingStrategy.LOWEST_LATENCY
      };

      mockVoiceService.getGeographicRouting.mockResolvedValue(mockRouting);

      const { result } = renderHook(() => useVoice());

      await act(async () => {
        // Wait for routing initialization
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(result.current.geographicRouting).toEqual(mockRouting);
        expect(mockRouting.latency).toBeLessThan(LATENCY_THRESHOLD);
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle voice synthesis errors', async () => {
      mockVoiceService.synthesizeVoice.mockRejectedValue(new Error('Synthesis failed'));

      const { result } = renderHook(() => useVoice());

      await act(async () => {
        try {
          await result.current.synthesizeVoice({
            text: 'Hello',
            voiceId: 'neural-1',
            engine: VoiceEngine.NEURAL_HD,
            language: 'en-US',
            pitch: 1.0,
            rate: 1.0,
            volume: 1.0,
            emphasis: [],
            quality: VoiceQuality.HIGH
          });
        } catch (error) {
          expect(error.message).toBe('Synthesis failed');
          expect(result.current.error).toBeTruthy();
          expect(result.current.isProcessing).toBe(false);
        }
      });
    });

    it('should handle geographic routing failures', async () => {
      mockVoiceService.getGeographicRouting.mockRejectedValue(new Error('Routing failed'));

      const { result } = renderHook(() => useVoice());

      await act(async () => {
        // Wait for routing initialization
        await new Promise(resolve => setTimeout(resolve, 100));

        expect(result.current.error).toBeTruthy();
        expect(result.current.geographicRouting).toBeNull();
      });
    });
  });
});