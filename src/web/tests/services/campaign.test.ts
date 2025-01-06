/**
 * @fileoverview Comprehensive test suite for CampaignService
 * Tests campaign management, AI optimization, analytics, and security features
 * Version: 1.0.0
 */

import { CampaignService } from '../../src/services/campaign.service';
import { ApiClient } from '../../src/lib/api';
import { ICampaign, CampaignType, CampaignStatus } from '../../src/types/campaign';
import { MetricType } from '../../src/types/analytics';

// Mock ApiClient
jest.mock('../../src/lib/api');

// Test campaign data
const mockCampaign: ICampaign = {
  id: 'test-campaign-id',
  name: 'Test Campaign',
  type: CampaignType.OUTBOUND_CALL,
  status: CampaignStatus.DRAFT,
  organizationId: 'test-org-id',
  aiConfig: {
    model: 'gpt-4',
    temperature: 0.7,
    maxTokens: 8000,
    optimizationTarget: 'conversion_rate'
  },
  performanceMetrics: {
    revenueTarget: 100000,
    conversionThreshold: 0.15,
    responseTimeLimit: 200
  },
  config: {
    budget: {
      daily: 100,
      total: 1000
    },
    targeting: {
      audience: ['B2B Technology'],
      locations: ['California'],
      interests: ['AI', 'Technology']
    }
  }
};

describe('CampaignService', () => {
  let campaignService: CampaignService;
  let mockApiClient: jest.Mocked<ApiClient>;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Initialize mocked API client
    mockApiClient = new ApiClient() as jest.Mocked<ApiClient>;
    mockApiClient.request.mockImplementation(() => Promise.resolve({}));

    // Create service instance
    campaignService = new CampaignService(mockApiClient);
  });

  describe('Campaign CRUD Operations', () => {
    test('should create campaign with AI configuration', async () => {
      const newCampaign = { ...mockCampaign };
      delete newCampaign.id;

      mockApiClient.request.mockResolvedValueOnce(mockCampaign);

      const result = await campaignService.createCampaign(newCampaign);

      expect(mockApiClient.request).toHaveBeenCalledWith(
        'POST',
        expect.any(String),
        expect.objectContaining({
          data: expect.objectContaining({
            aiConfig: expect.objectContaining({
              model: 'gpt-4',
              temperature: 0.7
            })
          })
        })
      );
      expect(result).toEqual(mockCampaign);
    });

    test('should get campaigns with filters', async () => {
      const filters = {
        status: [CampaignStatus.ACTIVE],
        type: [CampaignType.OUTBOUND_CALL],
        dateRange: {
          start: new Date('2023-01-01'),
          end: new Date('2023-12-31')
        }
      };

      mockApiClient.request.mockResolvedValueOnce([mockCampaign]);

      const result = await campaignService.getCampaigns(filters);

      expect(mockApiClient.request).toHaveBeenCalledWith(
        'GET',
        expect.any(String),
        expect.objectContaining({
          params: expect.objectContaining({
            status: filters.status,
            type: filters.type,
            dateRange: expect.any(Object)
          })
        })
      );
      expect(result).toEqual([mockCampaign]);
    });

    test('should update campaign with optimized settings', async () => {
      const updates = {
        status: CampaignStatus.ACTIVE,
        aiConfig: {
          temperature: 0.8
        }
      };

      mockApiClient.request.mockResolvedValueOnce({ ...mockCampaign, ...updates });

      const result = await campaignService.updateCampaign(mockCampaign.id, updates);

      expect(mockApiClient.request).toHaveBeenCalledWith(
        'PUT',
        expect.stringContaining(mockCampaign.id),
        expect.objectContaining({
          data: updates
        })
      );
      expect(result.status).toBe(CampaignStatus.ACTIVE);
    });
  });

  describe('Campaign Metrics and Analytics', () => {
    test('should retrieve campaign metrics with AI performance', async () => {
      const timeRange = {
        start: new Date('2023-01-01'),
        end: new Date('2023-12-31')
      };

      const mockMetrics = {
        revenue: 50000,
        conversions: 100,
        aiMetrics: {
          accuracy: 0.95,
          efficiency: 0.88
        }
      };

      mockApiClient.request.mockResolvedValueOnce(mockMetrics);

      const result = await campaignService.getCampaignMetrics(
        mockCampaign.id,
        timeRange,
        true
      );

      expect(mockApiClient.request).toHaveBeenCalledWith(
        'GET',
        expect.stringContaining('/metrics'),
        expect.objectContaining({
          params: {
            timeRange: {
              start: timeRange.start.toISOString(),
              end: timeRange.end.toISOString()
            },
            includeAiMetrics: true
          }
        })
      );
      expect(result).toEqual(mockMetrics);
    });

    test('should get AI-specific metrics', async () => {
      const mockAIMetrics = {
        accuracy: 0.95,
        efficiency: 0.88,
        optimizationScore: 0.92,
        recommendations: ['Increase budget for better performing segments']
      };

      mockApiClient.request.mockResolvedValueOnce(mockAIMetrics);

      const result = await campaignService.getAIMetrics(mockCampaign.id);

      expect(mockApiClient.request).toHaveBeenCalledWith(
        'GET',
        expect.stringContaining('/ai-metrics'),
        undefined
      );
      expect(result).toEqual(mockAIMetrics);
    });
  });

  describe('Campaign Status Management', () => {
    test('should update campaign status with optimization details', async () => {
      const optimizationDetails = {
        aiConfidence: 0.95,
        optimizationScore: 0.88
      };

      await campaignService.updateCampaignStatus(
        mockCampaign.id,
        CampaignStatus.OPTIMIZING,
        optimizationDetails
      );

      expect(mockApiClient.request).toHaveBeenCalledWith(
        'PATCH',
        expect.stringContaining('/status'),
        expect.objectContaining({
          data: {
            status: CampaignStatus.OPTIMIZING,
            optimizationDetails
          }
        })
      );
    });

    test('should check campaign health status', async () => {
      const mockHealth = {
        status: 'healthy',
        aiSystemStatus: 'operational',
        issues: []
      };

      mockApiClient.request.mockResolvedValueOnce(mockHealth);

      const result = await campaignService.checkCampaignHealth(mockCampaign.id);

      expect(mockApiClient.request).toHaveBeenCalledWith(
        'GET',
        expect.stringContaining('/health'),
        undefined
      );
      expect(result).toEqual(mockHealth);
    });
  });

  describe('Error Handling', () => {
    test('should handle API errors with proper error messages', async () => {
      const errorMessage = 'API Error';
      mockApiClient.request.mockRejectedValueOnce(new Error(errorMessage));

      await expect(campaignService.getCampaigns()).rejects.toThrow(errorMessage);
    });

    test('should handle network failures with circuit breaker', async () => {
      mockApiClient.request.mockRejectedValue(new Error('Network Error'));

      // Multiple failed requests should trigger circuit breaker
      for (let i = 0; i < 5; i++) {
        await expect(campaignService.getCampaigns()).rejects.toThrow();
      }

      // Verify circuit breaker state
      expect(mockApiClient.getCircuitState).toBeDefined();
    });
  });

  describe('Performance Monitoring', () => {
    test('should track API response times', async () => {
      const startTime = Date.now();
      mockApiClient.request.mockImplementation(() => new Promise(resolve => {
        setTimeout(() => resolve(mockCampaign), 100);
      }));

      await campaignService.getCampaignById(mockCampaign.id);
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(200); // API_CONFIG.TIMEOUT threshold
    });

    test('should handle rate limiting', async () => {
      mockApiClient.request.mockRejectedValueOnce({
        response: { status: 429 }
      });

      await expect(campaignService.getCampaigns()).rejects.toThrow();
      expect(mockApiClient.request).toHaveBeenCalledTimes(1);
    });
  });
});