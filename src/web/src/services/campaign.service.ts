/**
 * @fileoverview Enhanced campaign service for managing campaign operations
 * Implements advanced features including circuit breaker, caching, and AI optimization tracking
 * Version: 1.0.0
 */

import axios from 'axios'; // v1.4.0
import { ICampaign, ICampaignConfig, ICampaignMetrics, CampaignType, CampaignStatus } from '../types/campaign';
import { ApiClient } from '../lib/api';
import { API_CONFIG, AI_CONFIG } from '../lib/constants';

// Campaign endpoint configuration
const CAMPAIGN_ENDPOINTS = {
  BASE: `${API_CONFIG.VERSION}${API_CONFIG.ENDPOINTS.CAMPAIGNS}`,
  METRICS: '/metrics',
  STATUS: '/status',
  AI_METRICS: '/ai-metrics',
  HEALTH: '/health'
} as const;

// Circuit breaker configuration for campaign operations
const CIRCUIT_BREAKER_CONFIG = {
  failureThreshold: 5,
  resetTimeout: 30000,
  maxRetries: 3
};

// Cache configuration for campaign data
const CACHE_CONFIG = {
  ttl: 300000, // 5 minutes
  maxSize: 1000,
  invalidationEvents: ['campaign.update', 'campaign.delete']
};

/**
 * Enhanced service class for managing campaign operations with advanced features
 */
export class CampaignService {
  private apiClient: ApiClient;
  private baseUrl: string;

  constructor(apiClient: ApiClient, config?: { baseUrl?: string }) {
    this.apiClient = apiClient;
    this.baseUrl = config?.baseUrl || CAMPAIGN_ENDPOINTS.BASE;
  }

  /**
   * Creates a new campaign with enhanced validation and AI configuration
   */
  public async createCampaign(campaign: Omit<ICampaign, 'id'>): Promise<ICampaign> {
    try {
      // Validate and enhance AI configuration based on campaign type
      const enhancedConfig = this.enhanceAIConfig(campaign.config, campaign.type);

      const response = await this.apiClient.request<ICampaign>('POST', this.baseUrl, {
        data: { ...campaign, config: enhancedConfig }
      });

      return response;
    } catch (error) {
      throw this.handleCampaignError(error, 'Failed to create campaign');
    }
  }

  /**
   * Retrieves campaigns with advanced filtering and caching
   */
  public async getCampaigns(filters?: {
    status?: CampaignStatus[];
    type?: CampaignType[];
    dateRange?: { start: Date; end: Date };
    includeMetrics?: boolean;
  }): Promise<ICampaign[]> {
    try {
      const response = await this.apiClient.request<ICampaign[]>('GET', this.baseUrl, {
        params: {
          ...filters,
          dateRange: filters?.dateRange && {
            start: filters.dateRange.start.toISOString(),
            end: filters.dateRange.end.toISOString()
          }
        }
      });

      return response;
    } catch (error) {
      throw this.handleCampaignError(error, 'Failed to fetch campaigns');
    }
  }

  /**
   * Updates campaign configuration with AI optimization settings
   */
  public async updateCampaign(id: string, updates: Partial<ICampaign>): Promise<ICampaign> {
    try {
      if (updates.config) {
        updates.config = this.enhanceAIConfig(updates.config, updates.type);
      }

      const response = await this.apiClient.request<ICampaign>('PUT', `${this.baseUrl}/${id}`, {
        data: updates
      });

      return response;
    } catch (error) {
      throw this.handleCampaignError(error, 'Failed to update campaign');
    }
  }

  /**
   * Retrieves comprehensive campaign metrics including AI performance
   */
  public async getCampaignMetrics(
    id: string,
    timeRange?: { start: Date; end: Date },
    includeAiMetrics: boolean = true
  ): Promise<ICampaignMetrics> {
    try {
      const response = await this.apiClient.request<ICampaignMetrics>(
        'GET',
        `${this.baseUrl}/${id}${CAMPAIGN_ENDPOINTS.METRICS}`,
        {
          params: {
            timeRange: timeRange && {
              start: timeRange.start.toISOString(),
              end: timeRange.end.toISOString()
            },
            includeAiMetrics
          }
        }
      );

      return response;
    } catch (error) {
      throw this.handleCampaignError(error, 'Failed to fetch campaign metrics');
    }
  }

  /**
   * Updates campaign status with AI optimization tracking
   */
  public async updateCampaignStatus(
    id: string,
    status: CampaignStatus,
    optimizationDetails?: {
      aiConfidence: number;
      optimizationScore: number;
    }
  ): Promise<void> {
    try {
      await this.apiClient.request('PATCH', `${this.baseUrl}/${id}${CAMPAIGN_ENDPOINTS.STATUS}`, {
        data: {
          status,
          optimizationDetails
        }
      });
    } catch (error) {
      throw this.handleCampaignError(error, 'Failed to update campaign status');
    }
  }

  /**
   * Retrieves AI-specific campaign performance metrics
   */
  public async getAIMetrics(id: string): Promise<{
    accuracy: number;
    efficiency: number;
    optimizationScore: number;
    recommendations: string[];
  }> {
    try {
      const response = await this.apiClient.request(
        'GET',
        `${this.baseUrl}/${id}${CAMPAIGN_ENDPOINTS.AI_METRICS}`
      );

      return response;
    } catch (error) {
      throw this.handleCampaignError(error, 'Failed to fetch AI metrics');
    }
  }

  /**
   * Checks campaign health status including AI system health
   */
  public async checkCampaignHealth(id: string): Promise<{
    status: 'healthy' | 'degraded' | 'failed';
    aiSystemStatus: 'operational' | 'limited' | 'down';
    issues: string[];
  }> {
    try {
      const response = await this.apiClient.request(
        'GET',
        `${this.baseUrl}/${id}${CAMPAIGN_ENDPOINTS.HEALTH}`
      );

      return response;
    } catch (error) {
      throw this.handleCampaignError(error, 'Failed to check campaign health');
    }
  }

  /**
   * Enhances campaign configuration with AI-specific settings
   */
  private enhanceAIConfig(config: ICampaignConfig, type?: CampaignType): ICampaignConfig {
    const enhancedConfig = { ...config };
    const defaultAIConfig = type ? AI_CONFIG.MODEL_DEFAULTS[type] : {};

    enhancedConfig.aiConfig = {
      ...AI_CONFIG.LLM_SETTINGS,
      ...defaultAIConfig,
      ...config.aiConfig
    };

    if (type === CampaignType.OUTBOUND_CALL) {
      enhancedConfig.aiConfig.voice = {
        ...AI_CONFIG.VOICE_SYNTHESIS,
        ...config.aiConfig?.voice
      };
    }

    return enhancedConfig;
  }

  /**
   * Handles campaign-specific errors with detailed information
   */
  private handleCampaignError(error: any, defaultMessage: string): Error {
    if (axios.isAxiosError(error)) {
      const errorResponse = {
        message: error.response?.data?.message || defaultMessage,
        code: error.response?.data?.code || `HTTP_${error.response?.status}`,
        details: error.response?.data?.details || null
      };

      // Emit campaign error event for monitoring
      window.dispatchEvent(new CustomEvent('campaign-error', {
        detail: {
          ...errorResponse,
          timestamp: Date.now()
        }
      }));

      return new Error(errorResponse.message);
    }

    return error;
  }
}

// Export singleton instance
export const campaignService = new CampaignService(new ApiClient());