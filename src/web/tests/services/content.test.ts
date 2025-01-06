import { jest } from '@jest/globals';
import { ContentService } from '../../src/services/content.service';
import { ApiClient } from '../../src/lib/api';
import { 
  Content, 
  ContentType, 
  ContentPlatform, 
  ContentStatus,
  ContentMetadata 
} from '../../src/types/content';
import NodeCache from 'node-cache';
import * as datadogMetrics from 'datadog-metrics';

// Mock external dependencies
jest.mock('../../src/lib/api');
jest.mock('node-cache');
jest.mock('datadog-metrics');

describe('ContentService', () => {
  let contentService: ContentService;
  let mockApiClient: jest.Mocked<ApiClient>;
  let mockCache: jest.Mocked<NodeCache>;
  let mockMetrics: jest.Mocked<typeof datadogMetrics>;

  // Test data
  const testContent: Content = {
    id: 'test-content-id',
    campaignId: 'test-campaign-id',
    type: ContentType.TEXT,
    platform: ContentPlatform.LINKEDIN,
    content: 'Test content body',
    metadata: {
      title: 'Test Content',
      description: 'Test description',
      keywords: ['test', 'content'],
      language: 'en',
      targetAudience: ['professionals'],
      aiModel: 'gpt-4',
      generationPrompt: 'Generate test content'
    },
    status: ContentStatus.DRAFT,
    scheduledFor: new Date(),
    createdAt: new Date(),
    updatedAt: new Date(),
    aiGeneratedAt: new Date(),
    reviewedAt: new Date(),
    metrics: {
      impressions: 0,
      engagements: 0,
      clicks: 0,
      conversions: 0,
      performance: [],
      aiPerformance: []
    }
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Initialize mocks
    mockApiClient = {
      get: jest.fn(),
      post: jest.fn(),
      put: jest.fn(),
      delete: jest.fn(),
      request: jest.fn(),
      getCircuitState: jest.fn(),
      clearCache: jest.fn()
    } as unknown as jest.Mocked<ApiClient>;

    mockCache = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      on: jest.fn()
    } as unknown as jest.Mocked<NodeCache>;

    mockMetrics = {
      increment: jest.fn(),
      gauge: jest.fn()
    } as unknown as jest.Mocked<typeof datadogMetrics>;

    // Initialize ContentService with mocks
    contentService = new ContentService(
      mockApiClient,
      mockCache,
      mockMetrics
    );
  });

  describe('createContent', () => {
    it('should successfully create content with valid data', async () => {
      // Setup
      const contentData = {
        type: ContentType.TEXT,
        platform: ContentPlatform.LINKEDIN,
        content: 'Test content'
      };
      mockApiClient.post.mockResolvedValueOnce(testContent);

      // Execute
      const result = await contentService.createContent(contentData);

      // Assert
      expect(mockApiClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/create'),
        contentData
      );
      expect(mockCache.set).toHaveBeenCalledWith(
        `content_${testContent.id}`,
        testContent
      );
      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'content.generation',
        expect.any(Object)
      );
      expect(result).toEqual(testContent);
    });

    it('should throw error when required fields are missing', async () => {
      // Setup
      const invalidContent = { content: 'Test content' };

      // Execute & Assert
      await expect(contentService.createContent(invalidContent))
        .rejects
        .toThrow('Invalid content data: missing required fields');
      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'content.error',
        { type: 'creation' }
      );
    });
  });

  describe('generateContent', () => {
    const aiParams = {
      model: 'gpt-4',
      temperature: 0.7,
      maxTokens: 8000,
      contextWindow: 100000,
      targetPlatform: ContentPlatform.LINKEDIN
    };

    it('should successfully generate content using AI', async () => {
      // Setup
      mockApiClient.post.mockResolvedValueOnce(testContent);
      const startTime = Date.now();
      jest.spyOn(Date, 'now').mockReturnValueOnce(startTime);

      // Execute
      const result = await contentService.generateContent(
        testContent.metadata,
        aiParams
      );

      // Assert
      expect(mockApiClient.post).toHaveBeenCalledWith(
        expect.stringContaining('/generate'),
        expect.objectContaining({
          metadata: testContent.metadata,
          aiParams: expect.objectContaining(aiParams)
        })
      );
      expect(mockMetrics.gauge).toHaveBeenCalledWith(
        'ai.latency',
        expect.any(Number),
        expect.objectContaining({
          model: aiParams.model,
          platform: aiParams.targetPlatform
        })
      );
      expect(result).toEqual(testContent);
    });

    it('should handle AI generation failures', async () => {
      // Setup
      const error = new Error('AI generation failed');
      mockApiClient.post.mockRejectedValueOnce(error);

      // Execute & Assert
      await expect(contentService.generateContent(testContent.metadata, aiParams))
        .rejects
        .toThrow(error);
      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'content.error',
        { type: 'ai_generation' }
      );
    });
  });

  describe('distributeContent', () => {
    const distributionConfig = {
      scheduledFor: new Date(),
      platforms: [ContentPlatform.LINKEDIN, ContentPlatform.TWITTER],
      targeting: {
        audience: ['professionals'],
        locations: ['US']
      },
      optimization: {
        abTest: true,
        autoSchedule: true
      }
    };

    it('should successfully distribute content to multiple platforms', async () => {
      // Setup
      mockApiClient.post.mockResolvedValueOnce(undefined);

      // Execute
      await contentService.distributeContent(testContent.id, distributionConfig);

      // Assert
      expect(mockApiClient.post).toHaveBeenCalledWith(
        expect.stringContaining(`/${testContent.id}/distribute`),
        { distribution: distributionConfig }
      );
      expect(mockMetrics.increment).toHaveBeenCalledTimes(
        distributionConfig.platforms.length
      );
    });

    it('should throw error when no platforms are specified', async () => {
      // Setup
      const invalidConfig = { ...distributionConfig, platforms: [] };

      // Execute & Assert
      await expect(contentService.distributeContent(testContent.id, invalidConfig))
        .rejects
        .toThrow('Invalid distribution config: no platforms specified');
      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'content.error',
        { type: 'distribution' }
      );
    });
  });

  describe('getContentMetrics', () => {
    const timeframe = {
      start: new Date('2023-01-01'),
      end: new Date('2023-01-31')
    };

    it('should return cached metrics when available', async () => {
      // Setup
      const cachedMetrics = testContent.metrics;
      mockCache.get.mockReturnValueOnce(cachedMetrics);

      // Execute
      const result = await contentService.getContentMetrics(
        testContent.id,
        timeframe
      );

      // Assert
      expect(mockCache.get).toHaveBeenCalledWith(
        expect.stringContaining(`metrics_${testContent.id}`)
      );
      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'cache.hit',
        { type: 'metrics' }
      );
      expect(result).toEqual(cachedMetrics);
    });

    it('should fetch and cache metrics when not in cache', async () => {
      // Setup
      mockCache.get.mockReturnValueOnce(null);
      mockApiClient.get.mockResolvedValueOnce(testContent.metrics);

      // Execute
      const result = await contentService.getContentMetrics(
        testContent.id,
        timeframe
      );

      // Assert
      expect(mockApiClient.get).toHaveBeenCalledWith(
        expect.stringContaining(`/${testContent.id}/metrics`),
        { params: timeframe }
      );
      expect(mockCache.set).toHaveBeenCalledWith(
        expect.stringContaining(`metrics_${testContent.id}`),
        testContent.metrics,
        60
      );
      expect(mockMetrics.increment).toHaveBeenCalledWith(
        'cache.miss',
        { type: 'metrics' }
      );
      expect(result).toEqual(testContent.metrics);
    });
  });
});