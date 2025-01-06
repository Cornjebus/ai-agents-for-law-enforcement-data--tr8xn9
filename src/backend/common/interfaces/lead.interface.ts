/**
 * TypeScript interface definitions for lead-related data structures in the autonomous revenue generation platform.
 * Provides comprehensive type definitions for lead management, scoring, qualification, and interaction tracking
 * with support for AI-driven analytics and GDPR compliance.
 * @version 1.0.0
 */

import { UUID } from 'crypto'; // v18.0.0+
import { Campaign } from './campaign.interface';
import { IMetric } from './metric.interface';

/**
 * Enumeration of possible lead statuses in the qualification pipeline
 */
export enum LeadStatus {
    NEW = 'NEW',                     // Initial lead state
    QUALIFYING = 'QUALIFYING',       // Under AI evaluation
    QUALIFIED = 'QUALIFIED',         // Meets criteria
    NURTURING = 'NURTURING',        // In nurture campaign
    CONVERTED = 'CONVERTED',         // Successfully converted
    DISQUALIFIED = 'DISQUALIFIED'   // Does not meet criteria
}

/**
 * Enumeration of lead acquisition sources
 */
export enum LeadSource {
    OUTBOUND_CALL = 'OUTBOUND_CALL',
    LINKEDIN = 'LINKEDIN',
    TWITTER = 'TWITTER',
    TIKTOK = 'TIKTOK',
    EMAIL = 'EMAIL'
}

/**
 * Interface for tracking lead interactions
 */
export interface LeadInteraction {
    id: UUID;
    type: string;
    channel: string;
    content: string;
    duration?: number;
    sentiment?: number;
    aiAnalysis?: {
        intent: string;
        confidence: number;
        nextBestAction: string;
    };
    metadata: Record<string, any>;
    timestamp: Date;
}

/**
 * Interface for enhanced lead metadata with AI scoring and custom fields
 */
export interface LeadMetadata {
    industry: string;
    companySize: string;
    location: string;
    budget: string;
    interests: string[];
    tags: string[];
    aiScoreFactors: Record<string, number>;
    customFields: Record<string, any>;
}

/**
 * Interface for GDPR consent tracking
 */
export interface GDPRConsent {
    marketing: boolean;
    dataProcessing: boolean;
    thirdPartySharing: boolean;
    consentDate: Date;
    consentSource: string;
}

/**
 * Core lead interface defining all lead properties
 */
export interface ILead {
    id: UUID;
    campaignId: UUID;
    email: string;
    firstName: string;
    lastName: string;
    company: string;
    title: string;
    phone: string;
    score: number;
    status: LeadStatus;
    source: LeadSource;
    metadata: LeadMetadata;
    interactions: LeadInteraction[];
    metrics: IMetric[];
    gdprConsent: GDPRConsent;
    createdAt: Date;
    updatedAt: Date;
    lastInteractionAt: Date;
}

/**
 * Interface for lead qualification criteria
 */
export interface LeadQualificationCriteria {
    minimumScore: number;
    requiredFields: string[];
    disqualificationRules: string[];
    aiThresholds: {
        intent: number;
        engagement: number;
        budget: number;
    };
}

/**
 * Interface for lead enrichment data
 */
export interface LeadEnrichment {
    socialProfiles: {
        linkedin?: string;
        twitter?: string;
        tiktok?: string;
    };
    companyInfo: {
        revenue?: string;
        employees?: number;
        founded?: number;
        technology?: string[];
    };
    marketIntel: {
        competitors: string[];
        recentNews: string[];
        growthScore: number;
    };
}

/**
 * Interface for lead scoring factors
 */
export interface LeadScoringFactors {
    demographic: number;
    behavioral: number;
    engagement: number;
    intent: number;
    budget: number;
    authority: number;
    need: number;
    timing: number;
}

/**
 * Interface for lead privacy settings
 */
export interface LeadPrivacySettings {
    dataRetention: {
        policy: string;
        expiryDate: Date;
    };
    dataSharingPreferences: string[];
    anonymizationRequired: boolean;
    dataAccessLog: Array<{
        timestamp: Date;
        accessedBy: string;
        purpose: string;
    }>;
}