/**
 * @fileoverview TypeScript type definitions for content-related data structures
 * Supporting AI-driven content creation and multi-channel distribution
 * @version 1.0.0
 */

import { Campaign } from '../types/campaign';

/**
 * Enum defining supported content types for multi-channel distribution
 */
export enum ContentType {
  TEXT = 'TEXT',
  IMAGE = 'IMAGE',
  AUDIO = 'AUDIO',
  DOCUMENT = 'DOCUMENT'
}

/**
 * Enum defining supported distribution platforms including voice synthesis
 */
export enum ContentPlatform {
  LINKEDIN = 'LINKEDIN',
  TWITTER = 'TWITTER',
  TIKTOK = 'TIKTOK',
  EMAIL = 'EMAIL',
  VOICE = 'VOICE'
}

/**
 * Enum defining content lifecycle states with AI review workflow
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
 * Interface for voice synthesis configuration
 */
interface VoiceConfig {
  provider: string;
  voiceId: string;
  language: string;
  speed: number;
  pitch: number;
  emphasis: number;
}

/**
 * Interface for AI-specific performance metrics
 */
interface AIMetric {
  modelName: string;
  generationTime: number;
  tokenCount: number;
  confidenceScore: number;
  qualityScore: number;
  optimizationScore: number;
}

/**
 * Interface for standard performance metrics
 */
interface Metric {
  name: string;
  value: number;
  timestamp: Date;
  change: number;
  target: number;
}

/**
 * Interface for content metadata with AI and voice synthesis configuration
 */
export interface ContentMetadata {
  title: string;
  description: string;
  keywords: string[];
  language: string;
  targetAudience: string[];
  aiModel: string;
  generationPrompt: string;
  voiceConfig?: VoiceConfig;
}

/**
 * Interface for content performance metrics including AI-specific metrics
 */
export interface ContentMetrics {
  impressions: number;
  engagements: number;
  clicks: number;
  conversions: number;
  performance: Metric[];
  aiPerformance: AIMetric[];
}

/**
 * Main interface for content data structure with comprehensive AI and distribution support
 */
export interface Content {
  id: string;
  campaignId: string;
  type: ContentType;
  platform: ContentPlatform;
  content: string;
  metadata: ContentMetadata;
  metrics: ContentMetrics;
  status: ContentStatus;
  scheduledFor: Date;
  createdAt: Date;
  updatedAt: Date;
  aiGeneratedAt: Date;
  reviewedAt: Date;
}