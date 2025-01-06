/**
 * @fileoverview TypeScript type definitions for campaign management with AI capabilities
 * @version 1.0.0
 */

import { IAnalyticsMetric } from '../types/analytics';

/**
 * Enum defining supported autonomous campaign types
 */
export enum CampaignType {
  OUTBOUND_CALL = 'OUTBOUND_CALL',
  SOCIAL_MEDIA = 'SOCIAL_MEDIA',
  EMAIL_SEQUENCE = 'EMAIL_SEQUENCE'
}

/**
 * Enum defining campaign statuses including AI optimization states
 */
export enum CampaignStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  PAUSED = 'PAUSED',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  OPTIMIZING = 'OPTIMIZING'
}

/**
 * Interface for AI voice configuration settings
 */
interface IAIVoiceConfig {
  provider: string;
  voiceId: string;
  language: string;
  speed: number;
}

/**
 * Interface for campaign budget configuration
 */
interface IBudgetConfig {
  daily: number;
  total: number;
  alerts: {
    threshold: number;
    email: string[];
  };
}

/**
 * Interface for campaign targeting configuration
 */
interface ITargetingConfig {
  audience: string[];
  locations: {
    type: string;
    coordinates: number[];
  }[];
  interests: string[];
  exclusions: string[];
}

/**
 * Interface for campaign schedule configuration
 */
interface IScheduleConfig {
  timezone: string;
  activeHours: {
    start: string;
    end: string;
  }[];
  blackoutDates: Date[];
}

/**
 * Interface for AI optimization configuration
 */
interface IOptimizationConfig {
  enabled: boolean;
  target: string;
  strategy: string;
  constraints: {
    minROAS: number;
    maxCPA: number;
  };
  autoAdjust: {
    budget: boolean;
    targeting: boolean;
    schedule: boolean;
  };
}

/**
 * Interface for campaign configuration including AI settings
 */
export interface ICampaignConfig {
  budget: IBudgetConfig;
  targeting: ITargetingConfig;
  schedule: IScheduleConfig;
  aiConfig: {
    model: string;
    temperature: number;
    maxTokens: number;
    voice?: IAIVoiceConfig;
    contextWindow: number;
  };
  optimization: IOptimizationConfig;
}

/**
 * Interface for AI-specific performance metrics
 */
interface IAIMetrics {
  responseTime: number;
  accuracy: number;
  optimizationScore: number;
  confidenceLevel: number;
}

/**
 * Interface for voice call metrics
 */
interface IVoiceMetrics {
  clarity: number;
  engagement: number;
  callDuration: number;
  sentimentScore: number;
}

/**
 * Interface for real-time campaign metrics
 */
interface IRealTimeMetrics {
  activeLeads: number;
  queuedTasks: number;
  processingRate: number;
  errorRate: number;
}

/**
 * Interface for comprehensive campaign metrics
 */
export interface ICampaignMetrics {
  revenue: number;
  cost: number;
  roas: number;
  leads: number;
  conversions: number;
  conversionRate: number;
  analytics: IAnalyticsMetric[];
  aiMetrics: IAIMetrics;
  voiceMetrics: IVoiceMetrics;
  realTimeMetrics: IRealTimeMetrics;
}

/**
 * Main campaign interface with enhanced AI optimization tracking
 */
export interface ICampaign {
  id: string;
  organizationId: string;
  name: string;
  description: string;
  type: CampaignType;
  status: CampaignStatus;
  config: ICampaignConfig;
  metrics: ICampaignMetrics;
  startDate: Date;
  endDate: Date | null;
  createdAt: Date;
  updatedAt: Date;
  lastOptimizedAt: Date | null;
}