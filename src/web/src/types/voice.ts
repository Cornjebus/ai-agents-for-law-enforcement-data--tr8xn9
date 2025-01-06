/**
 * TypeScript type definitions for voice-related functionality
 * @version 1.0.0
 */

/**
 * Enumeration of possible voice call statuses
 */
export enum VoiceCallStatus {
  PENDING = 'PENDING',
  CONNECTING = 'CONNECTING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED',
  RECONNECTING = 'RECONNECTING',
  TRANSFERRING = 'TRANSFERRING',
  ON_HOLD = 'ON_HOLD'
}

/**
 * Enumeration of available voice synthesis engines
 */
export enum VoiceEngine {
  NEURAL = 'NEURAL',
  STANDARD = 'STANDARD',
  NEURAL_HD = 'NEURAL_HD',
  LOW_LATENCY = 'LOW_LATENCY'
}

/**
 * Enumeration of voice quality preferences
 */
export enum VoiceQuality {
  HIGH = 'HIGH',
  MEDIUM = 'MEDIUM',
  LOW = 'LOW',
  AUTO = 'AUTO'
}

/**
 * Enumeration of geographic routing strategies
 */
export enum RoutingStrategy {
  LOWEST_LATENCY = 'LOWEST_LATENCY',
  NEAREST_REGION = 'NEAREST_REGION',
  COST_OPTIMIZED = 'COST_OPTIMIZED',
  REDUNDANT = 'REDUNDANT'
}

/**
 * Union type of available voice metric types
 */
export type VoiceMetricType = 
  | 'latency'
  | 'quality'
  | 'duration'
  | 'errors'
  | 'jitter'
  | 'packetLoss'
  | 'mos';

/**
 * Type definition for comprehensive call performance metrics
 */
export type VoiceCallMetrics = Record<
  VoiceMetricType,
  Array<{
    value: number;
    timestamp: Date;
    region: string;
  }>
>;

/**
 * Type for speech emphasis markers
 */
export type EmphasisMarks = 'strong' | 'moderate' | 'reduced' | 'none';

/**
 * Interface for geographic routing configuration
 */
export interface IGeographicRouting {
  region: string;
  datacenter: string;
  latency: number;
  backupRegion: string | null;
  routingStrategy: RoutingStrategy;
}

/**
 * Interface for AI model configuration in voice calls
 */
export interface IAIModel {
  modelId: string;
  version: string;
  temperature: number;
  maxTokens: number;
  contextWindow: number;
  responseTimeout: number;
}

/**
 * Interface defining the structure of a voice call with performance tracking
 */
export interface IVoiceCall {
  id: string;
  phoneNumber: string;
  status: VoiceCallStatus;
  startTime: Date;
  endTime: Date | null;
  duration: number;
  transcription: string | null;
  metrics: VoiceCallMetrics;
  campaignId: string;
  leadId: string;
  geographicRouting: IGeographicRouting;
  aiModel: IAIModel;
  quality: VoiceQuality;
  recordingUrl: string | null;
  metadata: Record<string, unknown>;
}

/**
 * Interface for text-to-speech synthesis configuration
 */
export interface IVoiceSynthesisOptions {
  text: string;
  voiceId: string;
  engine: VoiceEngine;
  language: string;
  pitch: number;
  rate: number;
  volume: number;
  emphasis: EmphasisMarks[];
  quality: VoiceQuality;
}

/**
 * Interface for voice feature settings
 */
export interface IVoiceSettings {
  defaultVoiceId: string;
  preferredEngine: VoiceEngine;
  defaultLanguage: string;
  qualityPreference: VoiceQuality;
  speedMultiplier: number;
  latencyThreshold: number;
  autoReconnect: boolean;
  noiseReduction: boolean;
  echoReduction: boolean;
}