/**
 * TypeScript interface definitions for content-related data structures in the autonomous revenue generation platform.
 * Defines comprehensive content models with enhanced support for AI-driven content generation and multi-channel analytics.
 * @version 1.0.0
 */

import { UUID } from 'crypto';
import { ContentType, ContentPlatform } from './campaign.interface';
import { IMetric } from './metric.interface';

/**
 * Enumeration of possible content workflow statuses
 */
export enum ContentStatus {
    DRAFT = 'DRAFT',
    PENDING_APPROVAL = 'PENDING_APPROVAL',
    APPROVED = 'APPROVED',
    SCHEDULED = 'SCHEDULED',
    PUBLISHED = 'PUBLISHED',
    ARCHIVED = 'ARCHIVED'
}

/**
 * Interface for content metadata with comprehensive AI model tracking
 */
export interface ContentMetadata {
    title: string;
    description: string;
    keywords: string[];
    language: string;
    targetAudience: string[];
    aiModel: string;
    generationPrompt: string;
    modelVersion: string;
    generationParameters: Record<string, unknown>;
}

/**
 * Interface for content performance metrics with platform-specific and AI tracking
 */
export interface ContentMetrics {
    impressions: number;
    engagements: number;
    clicks: number;
    conversions: number;
    performance: IMetric[];
    platformSpecificMetrics: Record<string, unknown>;
    aiPerformanceMetrics: Record<string, number>;
}

/**
 * Core interface for content data structure with enhanced AI and analytics capabilities
 */
export interface IContent {
    /** Unique identifier for the content */
    id: UUID;

    /** Associated campaign identifier */
    campaignId: UUID;

    /** Type of content (TEXT, IMAGE, AUDIO, etc.) */
    type: ContentType;

    /** Distribution platform (LINKEDIN, TWITTER, etc.) */
    platform: ContentPlatform;

    /** Actual content data */
    content: string;

    /** Enhanced metadata including AI generation details */
    metadata: ContentMetadata;

    /** Comprehensive performance metrics */
    metrics: ContentMetrics;

    /** Current workflow status */
    status: ContentStatus;

    /** Scheduled publication time */
    scheduledFor: Date;

    /** Creation timestamp */
    createdAt: Date;

    /** Last update timestamp */
    updatedAt: Date;
}