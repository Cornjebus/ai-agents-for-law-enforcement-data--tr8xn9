/**
 * @fileoverview TypeScript type definitions for lead management with AI-driven scoring
 * @version 1.0.0
 */

import { CampaignType } from './campaign';

/**
 * Enum defining possible lead statuses in the pipeline
 */
export enum LeadStatus {
  NEW = 'NEW',
  CONTACTED = 'CONTACTED',
  QUALIFIED = 'QUALIFIED',
  CONVERTED = 'CONVERTED',
  LOST = 'LOST'
}

/**
 * Enum defining lead acquisition sources
 */
export enum LeadSource {
  OUTBOUND_CALL = 'OUTBOUND_CALL',
  SOCIAL_MEDIA = 'SOCIAL_MEDIA',
  EMAIL = 'EMAIL',
  WEBSITE = 'WEBSITE'
}

/**
 * Interface for AI-generated lead scoring metrics
 */
export interface IAIScore {
  overall: number;
  engagement: number;
  intent: number;
  budget: number;
  lastUpdated: Date;
}

/**
 * Interface for lead interaction tracking
 */
interface ILeadInteraction {
  id: string;
  type: string;
  timestamp: Date;
  channel: string;
  duration?: number;
  sentiment?: number;
  notes?: string;
  aiInsights?: {
    topics: string[];
    keyPoints: string[];
    nextSteps: string[];
  };
}

/**
 * Interface for lead metadata including AI-enriched data
 */
interface ILeadMetadata {
  industry?: string;
  companySize?: string;
  budget?: string;
  timeline?: string;
  technographics?: string[];
  socialProfiles?: {
    linkedin?: string;
    twitter?: string;
    other?: Record<string, string>;
  };
  aiEnrichment?: {
    predictedRevenue?: number;
    churnRisk?: number;
    competitorMentions?: string[];
    interests?: string[];
  };
}

/**
 * Interface for AI-recommended next actions
 */
export interface INextAction {
  id: string;
  type: string;
  priority: number;
  suggestedContent: string;
  dueDate: Date;
}

/**
 * Enhanced lead interface with AI scoring and action recommendations
 */
export interface ILead {
  id: string;
  organizationId: string;
  campaignId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  company: string;
  title: string;
  status: LeadStatus;
  source: LeadSource;
  score: number;
  aiScore: IAIScore;
  metadata: ILeadMetadata;
  interactions: ILeadInteraction[];
  nextActions: INextAction[];
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Interface for lead filtering and sorting options
 */
interface ILeadFilter {
  status?: LeadStatus[];
  source?: LeadSource[];
  scoreRange?: {
    min: number;
    max: number;
  };
  dateRange?: {
    start: Date;
    end: Date;
  };
  campaignTypes?: CampaignType[];
}

/**
 * Interface for lead analytics summary
 */
interface ILeadAnalytics {
  conversionRate: number;
  averageScore: number;
  responseTime: number;
  engagementMetrics: {
    callDuration: number;
    emailResponses: number;
    socialInteractions: number;
  };
  aiMetrics: {
    predictionAccuracy: number;
    optimizationRate: number;
    automationLevel: number;
  };
}