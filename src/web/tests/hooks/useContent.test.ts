import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react-hooks';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { waitFor } from '@testing-library/react';

import { useContent } from '../../src/hooks/useContent';
import { Content, ContentType, ContentPlatform, ContentStatus } from '../../src/types/content';
import contentReducer, { 
  generateContent, 
  distributeContent, 
  fetchContentMetrics 
} from '../../src/store/contentSlice';

// Mock store setup
const createMockStore = () => configureStore({
  reducer: {
    content: contentReducer
  }
});

// Mock content data
const mockContent: Content = {
  id: 'test-content-1',
  campaignId: 'test-campaign-1',
  type: ContentType.TEXT,
  platform: ContentPlatform.LINKEDIN,
  content: 'Test content',
  status: ContentStatus.DRAFT,
  metadata: {
    title: 'Test Content',
    description: 'Test description',
    keywords: ['test', 'content'],
    language: 'en',
    targetAudience: ['tech', 'b2b'],
    aiModel: 'gpt-4',
    generationPrompt: 'Generate test content'
  },
  metrics: {
    impressions: 0,
    engagements: 0,
    clicks: 0,
    conversions: 0,
    performance: [],
    aiPerformance: []
  },
  scheduledFor: new Date(),
  createdAt: new Date(),
  updatedAt: new Date(),
  aiGeneratedAt: new Date(),
  reviewedAt: new Date()
};

// Mock generation config
const mockGenerationConfig = {
  type: ContentType.TEXT,
  platform: ContentPlatform.LINKEDIN,
  metadata: {
    title: 'Test Content',
    description: 'Test description',
    keywords: ['test', 'content'],
    targetAudience: ['tech', 'b2b'],
    aiModel: 'gpt-4',
    generationPrompt: 'Generate test content'
  },
  aiParams: {
    temperature: 0.7,
    maxTokens: 1000,
    contextWindow: 2000
  }
};

// Mock distribution config
const mockDistributionConfig = {
  platforms: [ContentPlatform.LINKEDIN, ContentPlatform.TWITTER],
  scheduledFor: new Date(),
  targeting: {
    audience: ['tech', 'b2b'],
    locations: ['US', 'EU']
  },
  optimization: {
    abTest: true,
    autoSchedule: true
  }
};

describe('useContent Hook', () => {
  let store: ReturnType<typeof createMockStore>;
  let wrapper: React.FC;

  beforeEach(() => {
    store = createMockStore();
    wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    jest.clearAllMocks();
  });

  describe('AI Content Generation', () => {
    it('should generate content with AI optimization', async () => {
      const { result } = renderHook(() => useContent(), { wrapper });

      // Mock the generateContent thunk
      store.dispatch = jest.fn().mockResolvedValue({
        payload: { ...mockContent, id: 'generated-1' }
      });

      await act(async () => {
        await result.current.generateContent(mockGenerationConfig);
      });

      expect(store.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: generateContent.pending.type
        })
      );

      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBeFalsy();
    });

    it('should handle AI generation errors gracefully', async () => {
      const { result } = renderHook(() => useContent(), { wrapper });

      store.dispatch = jest.fn().mockRejectedValue({
        code: 'AI_GENERATION_ERROR',
        message: 'AI generation failed'
      });

      await act(async () => {
        try {
          await result.current.generateContent(mockGenerationConfig);
        } catch (error) {
          expect(error.code).toBe('AI_GENERATION_ERROR');
        }
      });

      expect(result.current.error).toBeTruthy();
      expect(result.current.isLoading).toBeFalsy();
    });

    it('should validate generation configuration', async () => {
      const { result } = renderHook(() => useContent(), { wrapper });

      const invalidConfig = { ...mockGenerationConfig, type: undefined };

      await act(async () => {
        try {
          await result.current.generateContent(invalidConfig);
        } catch (error) {
          expect(error.message).toContain('Invalid generation configuration');
        }
      });
    });
  });

  describe('Platform Distribution', () => {
    it('should distribute content to multiple platforms', async () => {
      const { result } = renderHook(() => useContent(), { wrapper });

      store.dispatch = jest.fn().mockResolvedValue({
        payload: { contentId: 'test-1', platforms: mockDistributionConfig.platforms }
      });

      await act(async () => {
        await result.current.distributeContent('test-1', mockDistributionConfig);
      });

      expect(store.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({
          type: distributeContent.pending.type
        })
      );
    });

    it('should handle distribution errors per platform', async () => {
      const { result } = renderHook(() => useContent(), { wrapper });

      store.dispatch = jest.fn().mockRejectedValue({
        code: 'DISTRIBUTION_ERROR',
        message: 'Failed to distribute to LinkedIn'
      });

      await act(async () => {
        try {
          await result.current.distributeContent('test-1', mockDistributionConfig);
        } catch (error) {
          expect(error.code).toBe('DISTRIBUTION_ERROR');
        }
      });
    });

    it('should validate platform configuration', async () => {
      const { result } = renderHook(() => useContent(), { wrapper });

      const invalidConfig = { ...mockDistributionConfig, platforms: [] };

      await act(async () => {
        try {
          await result.current.distributeContent('test-1', invalidConfig);
        } catch (error) {
          expect(error.message).toContain('No distribution platforms specified');
        }
      });
    });
  });

  describe('Analytics Integration', () => {
    it('should track content metrics in real-time', async () => {
      const { result } = renderHook(() => useContent(), { wrapper });

      store.dispatch = jest.fn().mockResolvedValue({
        payload: {
          contentId: 'test-1',
          metrics: {
            impressions: 100,
            engagements: 50,
            clicks: 25,
            conversions: 5
          }
        }
      });

      await act(async () => {
        result.current.fetchMetrics('test-1');
      });

      await waitFor(() => {
        expect(store.dispatch).toHaveBeenCalledWith(
          expect.objectContaining({
            type: fetchContentMetrics.pending.type
          })
        );
      });
    });

    it('should debounce metrics fetching', async () => {
      const { result } = renderHook(() => useContent(), { wrapper });
      
      const fetchSpy = jest.spyOn(store, 'dispatch');

      await act(async () => {
        result.current.fetchMetrics('test-1');
        result.current.fetchMetrics('test-1');
        result.current.fetchMetrics('test-1');
      });

      // Wait for debounce timeout
      await new Promise(resolve => setTimeout(resolve, 1100));

      expect(fetchSpy).toHaveBeenCalledTimes(1);
    });

    it('should optimize content based on analytics', async () => {
      const { result } = renderHook(() => useContent(), { wrapper });

      store.dispatch = jest.fn().mockResolvedValue({
        payload: {
          ...mockContent,
          metrics: {
            ...mockContent.metrics,
            aiPerformance: [{
              modelName: 'gpt-4',
              generationTime: 1200,
              tokenCount: 500,
              confidenceScore: 0.95,
              qualityScore: 0.88,
              optimizationScore: 0.92
            }]
          }
        }
      });

      await act(async () => {
        await result.current.optimizeContent('test-1', ContentPlatform.LINKEDIN);
      });

      expect(result.current.error).toBeNull();
      expect(result.current.isLoading).toBeFalsy();
    });
  });
});