import { Entity, Column, Index } from 'typeorm';
import { IMetric } from '../../../common/interfaces/metric.interface';

/**
 * Enumeration of possible call statuses including AI processing states
 */
export enum CallStatus {
    PENDING = 'PENDING',
    CONNECTING = 'CONNECTING',
    IN_PROGRESS = 'IN_PROGRESS',
    AI_PROCESSING = 'AI_PROCESSING',
    COMPLETED = 'COMPLETED',
    FAILED = 'FAILED',
    CANCELLED = 'CANCELLED',
    ROUTING = 'ROUTING',
    TRANSCRIBING = 'TRANSCRIBING'
}

/**
 * Type definition for call performance metrics collection
 */
export type CallMetrics = Record<string, IMetric[]>;

/**
 * Type definition for geographic routing metadata
 */
export type GeographicMetadata = {
    region: string;
    latency: number;
    routingPath: string[];
    nearestEdgeLocation: string;
    routingOptimization: boolean;
};

/**
 * Type definition for AI model metadata and performance tracking
 */
export type AIModelMetadata = {
    modelId: string;
    confidence: number;
    processingTime: number;
    contextLength: number;
    responseTokens: number;
    temperatureUsed: number;
    modelVersion: string;
};

/**
 * Interface for call initialization parameters
 */
export interface ICallInit {
    phoneNumber: string;
    campaignId: string;
    leadId: string;
    region: string;
    isEncrypted?: boolean;
}

/**
 * Comprehensive interface for voice call with AI and performance features
 */
export interface ICall {
    id: string;
    phoneNumber: string;
    status: CallStatus;
    startTime: Date;
    endTime: Date | null;
    duration: number;
    transcription: string | null;
    metrics: CallMetrics;
    campaignId: string;
    leadId: string;
    geoMetadata: GeographicMetadata;
    aiMetadata: AIModelMetadata;
    isEncrypted: boolean;
    region: string;
    rttLatency: number;
}

/**
 * Entity class representing a voice call with AI conversation capabilities
 * and comprehensive performance monitoring
 */
@Entity('calls')
@Index(['campaignId'])
@Index(['leadId'])
@Index(['status'])
export class Call implements ICall {
    @Column('uuid', { primary: true, generated: 'uuid' })
    id: string;

    @Column('varchar')
    phoneNumber: string;

    @Column('enum', { enum: CallStatus })
    status: CallStatus;

    @Column('timestamp')
    startTime: Date;

    @Column('timestamp', { nullable: true })
    endTime: Date | null;

    @Column('integer', { default: 0 })
    duration: number;

    @Column('text', { nullable: true })
    transcription: string | null;

    @Column('jsonb')
    metrics: CallMetrics;

    @Column('uuid')
    campaignId: string;

    @Column('uuid')
    leadId: string;

    @Column('jsonb')
    geoMetadata: GeographicMetadata;

    @Column('jsonb')
    aiMetadata: AIModelMetadata;

    @Column('boolean', { default: true })
    isEncrypted: boolean;

    @Column('varchar')
    region: string;

    @Column('float', { default: 0 })
    rttLatency: number;

    /**
     * Initializes a new call instance with geographic routing and AI capabilities
     */
    constructor(init: ICallInit) {
        this.phoneNumber = init.phoneNumber;
        this.campaignId = init.campaignId;
        this.leadId = init.leadId;
        this.status = CallStatus.PENDING;
        this.startTime = new Date();
        this.endTime = null;
        this.duration = 0;
        this.transcription = null;
        this.metrics = {};
        this.region = init.region;
        this.rttLatency = 0;
        this.isEncrypted = init.isEncrypted ?? true;

        // Initialize geographic metadata
        this.geoMetadata = {
            region: init.region,
            latency: 0,
            routingPath: [],
            nearestEdgeLocation: '',
            routingOptimization: true
        };

        // Initialize AI metadata
        this.aiMetadata = {
            modelId: '',
            confidence: 0,
            processingTime: 0,
            contextLength: 0,
            responseTokens: 0,
            temperatureUsed: 0.7,
            modelVersion: ''
        };
    }

    /**
     * Updates call status with comprehensive metric tracking
     */
    async updateStatus(newStatus: CallStatus): Promise<void> {
        const previousStatus = this.status;
        this.status = newStatus;

        // Update timing metrics
        if (newStatus === CallStatus.COMPLETED || newStatus === CallStatus.FAILED) {
            this.endTime = new Date();
            this.duration = this.endTime.getTime() - this.startTime.getTime();
        }

        // Track status transition metric
        this.addMetric({
            type: 'STATUS_CHANGE',
            value: 1,
            timestamp: new Date(),
            metadata: {
                previousStatus,
                newStatus,
                transitionTime: Date.now()
            }
        } as IMetric);

        // Update RTT metrics for voice processing
        if (this.rttLatency > 0) {
            this.addMetric({
                type: 'VOICE_LATENCY',
                value: this.rttLatency,
                timestamp: new Date()
            } as IMetric);
        }
    }

    /**
     * Adds a performance metric with enhanced tracking
     */
    addMetric(metric: IMetric): void {
        if (!this.metrics[metric.type]) {
            this.metrics[metric.type] = [];
        }

        // Ensure timestamp is set
        metric.timestamp = metric.timestamp || new Date();

        // Add metric to collection
        this.metrics[metric.type].push(metric);

        // Update RTT latency if applicable
        if (metric.type === 'VOICE_LATENCY') {
            this.rttLatency = metric.value;
            
            // Update geographic routing metadata
            this.geoMetadata.latency = metric.value;
        }

        // Update AI performance metrics if applicable
        if (metric.type === 'AI_PROCESSING') {
            this.aiMetadata.processingTime = metric.value;
            if (metric.metadata?.confidence) {
                this.aiMetadata.confidence = metric.metadata.confidence;
            }
        }
    }
}