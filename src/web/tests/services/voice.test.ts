/**
 * @fileoverview Comprehensive test suite for VoiceService class validating voice operations
 * Version: 1.0.0
 */

import { jest } from '@jest/globals'; // v29.6.0
import { VoiceService } from '../../src/services/voice.service';
import { ApiClient } from '../../src/lib/api';
import {
  VoiceCallStatus,
  VoiceEngine,
  VoiceQuality,
  RoutingStrategy,
  IVoiceCall,
  IGeographicRouting
} from '../../src/types/voice';

// Test constants
const TEST_PHONE_NUMBER = '+1234567890';
const TEST_CAMPAIGN_ID = 'test-campaign-id';
const TEST_CALL_ID = 'test-call-id';
const LATENCY_THRESHOLD = 200; // ms
const VOICE_QUALITY_THRESHOLD = 0.85;

// Mock API client
jest.mock('../../src/lib/api');
const mockApiClient = new ApiClient() as jest.Mocked<ApiClient>;

describe('VoiceService', () => {
  let voiceService: VoiceService;
  let mockGeographicRouting: IGeographicRouting;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Initialize mock geographic routing
    mockGeographicRouting = {
      region: 'us-west-1',
      datacenter: 'primary',
      latency: 50,
      backupRegion: 'us-east-1',
      routingStrategy: RoutingStrategy.LOWEST_LATENCY
    };

    // Initialize VoiceService with mocked dependencies
    voiceService = new VoiceService(mockApiClient, mockGeographicRouting);
  });

  describe('initiateCall', () => {
    const mockCallResponse: IVoiceCall = {
      id: TEST_CALL_ID,
      phoneNumber: TEST_PHONE_NUMBER,
      status: VoiceCallStatus.CONNECTING,
      startTime: new Date(),
      endTime: null,
      duration: 0,
      transcription: null,
      metrics: {
        latency: [{ value: 50, timestamp: new Date(), region: 'us-west-1' }],
        quality: [{ value: 0.95, timestamp: new Date(), region: 'us-west-1' }],
        duration: [{ value: 0, timestamp: new Date(), region: 'us-west-1' }],
        errors: [],
        jitter: [{ value: 15, timestamp: new Date(), region: 'us-west-1' }],
        packetLoss: [{ value: 0.001, timestamp: new Date(), region: 'us-west-1' }],
        mos: [{ value: 4.2, timestamp: new Date(), region: 'us-west-1' }]
      },
      campaignId: TEST_CAMPAIGN_ID,
      leadId: 'test-lead-id',
      geographicRouting: mockGeographicRouting,
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

    it('should successfully initiate a call with optimal routing', async () => {
      mockApiClient.post.mockResolvedValueOnce(mockCallResponse);

      const result = await voiceService.initiateCall(
        TEST_PHONE_NUMBER,
        TEST_CAMPAIGN_ID,
        { engine: VoiceEngine.NEURAL, quality: VoiceQuality.HIGH }
      );

      expect(result).toEqual(mockCallResponse);
      expect(mockApiClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/calls'),
        expect.objectContaining({
          phoneNumber: TEST_PHONE_NUMBER,
          campaignId: TEST_CAMPAIGN_ID,
          geographicRouting: mockGeographicRouting
        })
      );
    });

    it('should handle invalid phone numbers', async () => {
      await expect(
        voiceService.initiateCall('invalid-number', TEST_CAMPAIGN_ID)
      ).rejects.toThrow('Invalid phone number format');
    });

    it('should validate latency requirements', async () => {
      const highLatencyResponse = {
        ...mockCallResponse,
        metrics: {
          ...mockCallResponse.metrics,
          latency: [{ value: 250, timestamp: new Date(), region: 'us-west-1' }]
        }
      };

      mockApiClient.post.mockResolvedValueOnce(highLatencyResponse);

      await expect(
        voiceService.initiateCall(TEST_PHONE_NUMBER, TEST_CAMPAIGN_ID)
      ).rejects.toThrow('Route latency exceeds threshold');
    });
  });

  describe('voiceQuality', () => {
    it('should validate voice synthesis quality', async () => {
      const mockQualityMetrics = {
        clarity: 0.92,
        naturalness: 0.89,
        pronunciation: 0.95
      };

      mockApiClient.post.mockResolvedValueOnce({ metrics: mockQualityMetrics });

      const result = await voiceService.validateVoiceQuality({
        text: 'Test message',
        voiceId: 'neural-voice-1',
        engine: VoiceEngine.NEURAL,
        quality: VoiceQuality.HIGH
      });

      expect(result.metrics.clarity).toBeGreaterThanOrEqual(VOICE_QUALITY_THRESHOLD);
      expect(result.metrics.naturalness).toBeGreaterThanOrEqual(VOICE_QUALITY_THRESHOLD);
      expect(result.metrics.pronunciation).toBeGreaterThanOrEqual(VOICE_QUALITY_THRESHOLD);
    });
  });

  describe('geographicRouting', () => {
    it('should select optimal routing based on latency', async () => {
      const mockLatencies = {
        'us-west-1': 50,
        'us-east-1': 80
      };

      mockApiClient.get.mockImplementation(async (url) => {
        const region = url.split('/').pop();
        return { latency: mockLatencies[region] };
      });

      const routing = await voiceService.getGeographicRouting();

      expect(routing.region).toBe('us-west-1');
      expect(routing.latency).toBeLessThan(LATENCY_THRESHOLD);
    });

    it('should failover to backup region when primary is degraded', async () => {
      const mockLatencies = {
        'us-west-1': 250, // Degraded
        'us-east-1': 60
      };

      mockApiClient.get.mockImplementation(async (url) => {
        const region = url.split('/').pop();
        return { latency: mockLatencies[region] };
      });

      const routing = await voiceService.getGeographicRouting();

      expect(routing.region).toBe('us-east-1');
      expect(routing.latency).toBeLessThan(LATENCY_THRESHOLD);
    });
  });

  describe('callMetrics', () => {
    it('should monitor real-time call performance', async () => {
      const mockMetrics = {
        latency: [{ value: 45, timestamp: new Date(), region: 'us-west-1' }],
        quality: [{ value: 0.96, timestamp: new Date(), region: 'us-west-1' }],
        mos: [{ value: 4.3, timestamp: new Date(), region: 'us-west-1' }]
      };

      mockApiClient.get.mockResolvedValueOnce({ metrics: mockMetrics });

      const result = await voiceService.getCallMetrics(TEST_CALL_ID);

      expect(result.metrics.latency[0].value).toBeLessThan(LATENCY_THRESHOLD);
      expect(result.metrics.quality[0].value).toBeGreaterThan(VOICE_QUALITY_THRESHOLD);
      expect(result.metrics.mos[0].value).toBeGreaterThan(4.0);
    });

    it('should detect and report performance degradation', async () => {
      const mockDegradedMetrics = {
        latency: [{ value: 250, timestamp: new Date(), region: 'us-west-1' }],
        quality: [{ value: 0.75, timestamp: new Date(), region: 'us-west-1' }],
        mos: [{ value: 3.5, timestamp: new Date(), region: 'us-west-1' }]
      };

      mockApiClient.get.mockResolvedValueOnce({ metrics: mockDegradedMetrics });

      await expect(
        voiceService.getCallMetrics(TEST_CALL_ID)
      ).rejects.toThrow('Performance metrics below threshold');
    });
  });

  describe('error handling', () => {
    it('should handle network errors gracefully', async () => {
      mockApiClient.post.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        voiceService.initiateCall(TEST_PHONE_NUMBER, TEST_CAMPAIGN_ID)
      ).rejects.toThrow('Failed to initiate call');
    });

    it('should handle API errors with proper status codes', async () => {
      mockApiClient.post.mockRejectedValueOnce({
        response: { status: 429, data: { message: 'Rate limit exceeded' } }
      });

      await expect(
        voiceService.initiateCall(TEST_PHONE_NUMBER, TEST_CAMPAIGN_ID)
      ).rejects.toThrow('Rate limit exceeded');
    });
  });
});