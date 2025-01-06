/**
 * TypeScript interface definitions for campaign-related data structures in the autonomous revenue generation platform.
 * Defines comprehensive campaign data models, configuration types, content management, and performance tracking interfaces.
 * @version 1.0.0
 */

import { UUID } from 'crypto';
import { IMetric } from './metric.interface';

/**
 * Enumeration of supported campaign types
 */
export enum CampaignType {
    OUTBOUND_CALL = 'OUTBOUND_CALL',
    SOCIAL_MEDIA = 'SOCIAL_MEDIA',
    EMAIL_SEQUENCE = 'EMAIL_SEQUENCE',
    MULTI_CHANNEL = 'MULTI_CHANNEL'
}

/**
 * Enumeration of supported content types for campaign assets
 */
export enum ContentType {
    TEXT = 'TEXT',
    IMAGE = 'IMAGE',
    AUDIO = 'AUDIO',
    DOCUMENT = 'DOCUMENT',
    VIDEO = 'VIDEO'
}

/**
 * Enumeration of supported content distribution platforms
 */
export enum ContentPlatform {
    LINKEDIN = 'LINKEDIN',
    TWITTER = 'TWITTER',
    TIKTOK = 'TIKTOK',
    EMAIL = 'EMAIL',
    VOICE = 'VOICE'
}

/**
 * Enumeration of possible campaign statuses
 */
export enum CampaignStatus {
    DRAFT = 'DRAFT',
    SCHEDULED = 'SCHEDULED',
    ACTIVE = 'ACTIVE',
    PAUSED = 'PAUSED',
    COMPLETED = 'COMPLETED',
    ARCHIVED = 'ARCHIVED'
}

/**
 * Interface for campaign AI configuration
 */
export interface CampaignAIConfig {
    modelType: string;
    temperature: number;
    maxTokens: number;
    voiceId?: string;
    customPrompts: Record<string, string>;
    contextWindow: number;
    optimizationGoals: string[];
    learningRate: number;
    retrainingInterval: number;
}

/**
 * Interface for campaign targeting configuration
 */
export interface CampaignTargeting {
    audience: {
        industries: string[];
        companySize: string[];
        roles: string[];
        geography: string[];
    };
    exclusions: {
        industries?: string[];
        companies?: string[];
        domains?: string[];
    };
    customFilters: Record<string, any>;
    prioritization: Record<string, number>;
}

/**
 * Interface for campaign budget configuration
 */
export interface CampaignBudget {
    totalBudget: number;
    dailyLimit: number;
    currency: string;
    costPerAction: Record<string, number>;
    alerts: {
        thresholds: number[];
        notifications: string[];
    };
    optimization: {
        strategy: string;
        constraints: Record<string, any>;
    };
}

/**
 * Interface for campaign metrics tracking
 */
export interface CampaignMetrics {
    performance: IMetric[];
    engagement: {
        impressions: number;
        interactions: number;
        conversions: number;
        conversionRate: number;
    };
    revenue: {
        generated: number;
        projected: number;
        roi: number;
    };
    quality: {
        leadScore: number;
        responseRate: number;
        satisfactionScore: number;
    };
}

/**
 * Interface for campaign content configuration
 */
export interface CampaignContent {
    type: ContentType;
    platform: ContentPlatform;
    content: string | Record<string, any>;
    schedule: {
        startTime: Date;
        frequency: string;
        timezone: string;
    };
    variations: Array<{
        id: string;
        content: string | Record<string, any>;
        performance?: Partial<CampaignMetrics>;
    }>;
}

/**
 * Interface for campaign configuration
 */
export interface CampaignConfig {
    channels: ContentPlatform[];
    content: CampaignContent[];
    schedule: {
        timezone: string;
        activeHours: {
            start: string;
            end: string;
            days: number[];
        };
        throttling: {
            maxPerHour: number;
            maxPerDay: number;
        };
    };
    abTesting: {
        enabled: boolean;
        variants: string[];
        distributionRatio: number[];
    };
    integrations: {
        crm?: string;
        analytics?: string[];
        messaging?: string[];
    };
}

/**
 * Core campaign interface defining all campaign properties
 */
export interface Campaign {
    id: UUID;
    organizationId: UUID;
    name: string;
    description: string;
    status: CampaignStatus;
    type: CampaignType;
    configuration: CampaignConfig;
    metrics: CampaignMetrics;
    budget: CampaignBudget;
    targeting: CampaignTargeting;
    aiConfig: CampaignAIConfig;
    startDate: Date;
    endDate: Date | null;
    createdAt: Date;
    updatedAt: Date;
}