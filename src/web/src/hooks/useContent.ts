/**
 * @fileoverview Enhanced React hook for managing content operations with AI-driven generation,
 * multi-platform distribution, and real-time analytics
 * @version 1.0.0
 */

import { useDispatch, useSelector } from 'react-redux';
import { useState, useCallback } from 'react';
import { useDebounce } from 'use-debounce'; // v9.0.0

import { Content, ContentType, ContentPlatform, ContentStatus } from '../types/content';
import { ContentService } from '../services/content.service';
import {
  generateContent,
  distributeContent,
  fetchContentMetrics,
  selectContentById,
  selectContentMetrics,
  selectAIGenerationStatus,
  updateAIStatus,
  updateDistributionStatus
} from '../store/contentSlice';

// Types for enhanced error handling
interface ContentError {
  code: string;
  message: string;
  details?: any;
}

// Interface for content generation configuration
interface GenerationConfig {
  type: ContentType;
  platform: ContentPlatform;
  metadata: {
    title: string;
    description: string;
    keywords: string[];
    targetAudience: string[];
    aiModel: string;
    generationPrompt: string;
  };
  aiParams?: {
    temperature?: number;
    maxTokens?: number;
    contextWindow?: number;
  };
}

// Interface for content distribution configuration
interface DistributionConfig {
  platforms: ContentPlatform[];
  scheduledFor?: Date;
  targeting?: {
    audience: string[];
    locations: string[];
  };
  optimization?: {
    abTest: boolean;
    autoSchedule: boolean;
  };
}

/**
 * Enhanced custom hook for managing content operations
 */
export function useContent() {
  const dispatch = useDispatch();
  const contentService = new ContentService();

  // Local state for loading and error handling
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<ContentError | null>(null);

  // Redux selectors with memoization
  const content = useSelector(selectContentById);
  const metrics = useSelector(selectContentMetrics);
  const aiStatus = useSelector(selectAIGenerationStatus);

  // Debounced metrics fetching to prevent excessive API calls
  const [debouncedFetchMetrics] = useDebounce(
    (contentId: string) => {
      dispatch(fetchContentMetrics(contentId));
    },
    1000
  );

  /**
   * Validates content generation configuration
   */
  const validateGenerationConfig = (config: GenerationConfig): boolean => {
    if (!config.type || !config.platform || !config.metadata) {
      setError({
        code: 'INVALID_CONFIG',
        message: 'Invalid generation configuration'
      });
      return false;
    }
    return true;
  };

  /**
   * Enhanced content generation handler with AI optimization
   */
  const handleGenerateContent = useCallback(async (
    config: GenerationConfig
  ): Promise<Content> => {
    try {
      setIsLoading(true);
      setError(null);

      // Validate configuration
      if (!validateGenerationConfig(config)) {
        throw new Error('Invalid generation configuration');
      }

      // Update AI status to generating
      dispatch(updateAIStatus({
        contentId: 'temp',
        status: {
          status: 'generating',
          progress: 0
        }
      }));

      // Dispatch generation action with optimized parameters
      const result = await dispatch(generateContent({
        contentId: 'temp',
        metadata: {
          ...config.metadata,
          aiParams: {
            ...config.aiParams,
            optimizationEnabled: true
          }
        }
      })).unwrap();

      // Update metrics after generation
      debouncedFetchMetrics(result.id);

      return result;
    } catch (error: any) {
      setError({
        code: error.code || 'GENERATION_ERROR',
        message: error.message,
        details: error.details
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [dispatch, debouncedFetchMetrics]);

  /**
   * Enhanced content distribution handler with platform optimization
   */
  const handleDistributeContent = useCallback(async (
    contentId: string,
    config: DistributionConfig
  ): Promise<void> => {
    try {
      setIsLoading(true);
      setError(null);

      // Validate platforms configuration
      if (!config.platforms || config.platforms.length === 0) {
        throw new Error('No distribution platforms specified');
      }

      // Update distribution status for each platform
      config.platforms.forEach(platform => {
        dispatch(updateDistributionStatus({
          contentId,
          status: {
            platform,
            status: 'pending',
            scheduledFor: config.scheduledFor
          }
        }));
      });

      // Dispatch distribution action
      await dispatch(distributeContent({
        contentId,
        platforms: config.platforms
      })).unwrap();

      // Update metrics after distribution
      debouncedFetchMetrics(contentId);
    } catch (error: any) {
      setError({
        code: error.code || 'DISTRIBUTION_ERROR',
        message: error.message,
        details: error.details
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [dispatch, debouncedFetchMetrics]);

  /**
   * Optimizes content for target platform
   */
  const optimizeContent = useCallback(async (
    contentId: string,
    platform: ContentPlatform
  ): Promise<Content> => {
    try {
      setIsLoading(true);
      setError(null);

      const result = await contentService.optimizeContent(contentId, {
        platform,
        optimizationParams: {
          qualityThreshold: 0.85,
          performanceTarget: 'engagement'
        }
      });

      // Update metrics after optimization
      debouncedFetchMetrics(contentId);

      return result;
    } catch (error: any) {
      setError({
        code: error.code || 'OPTIMIZATION_ERROR',
        message: error.message,
        details: error.details
      });
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, [contentService, debouncedFetchMetrics]);

  return {
    // Content operations
    generateContent: handleGenerateContent,
    distributeContent: handleDistributeContent,
    optimizeContent,
    
    // State
    content,
    metrics,
    aiStatus,
    isLoading,
    error,

    // Utilities
    fetchMetrics: debouncedFetchMetrics
  };
}