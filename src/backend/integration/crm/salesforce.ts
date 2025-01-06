import jsforce from 'jsforce'; // v1.11.0
import axios from 'axios'; // v1.4.0
import winston from 'winston'; // v3.9.0
import Redis from 'ioredis'; // v5.3.0
import { Counter, Registry } from 'prom-client'; // v14.2.0
import CircuitBreaker from 'circuit-breaker-js'; // v0.0.1
import crypto from 'crypto';

import { ILead, LeadStatus } from '../../common/interfaces/lead.interface';
import { createDatabasePool } from '../../common/config/database';

/**
 * Configuration interface for Salesforce connection
 */
export interface SalesforceConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    apiVersion: string;
    environment: string;
    maxRetries: number;
    timeout: number;
    webhookSecret: string;
}

/**
 * Interface for Salesforce webhook event payloads
 */
interface SalesforceWebhookPayload {
    objectType: string;
    eventType: string;
    data: Record<string, any>;
    timestamp: Date;
    signature: string;
}

/**
 * Interface for Salesforce operation metrics
 */
interface SalesforceMetrics {
    operationType: string;
    duration: number;
    success: boolean;
    errorType?: string;
    timestamp: Date;
}

/**
 * Service class for managing Salesforce CRM integration with enhanced reliability and monitoring
 */
export class SalesforceService {
    private connection: jsforce.Connection;
    private readonly config: SalesforceConfig;
    private readonly dbPool;
    private readonly cache: Redis;
    private readonly metrics: Counter;
    private readonly circuitBreaker: any;
    private readonly logger: winston.Logger;

    constructor(config: SalesforceConfig) {
        this.config = {
            ...config,
            maxRetries: config.maxRetries || 3,
            timeout: config.timeout || 30000,
            apiVersion: config.apiVersion || '55.0'
        };

        // Initialize database connection
        this.dbPool = createDatabasePool();

        // Initialize Redis cache
        this.cache = new Redis({
            host: process.env.REDIS_HOST,
            port: parseInt(process.env.REDIS_PORT || '6379'),
            password: process.env.REDIS_PASSWORD,
            enableReadyCheck: true
        });

        // Initialize circuit breaker
        this.circuitBreaker = new CircuitBreaker({
            windowDuration: 10000,
            numBuckets: 10,
            timeoutDuration: 3000,
            errorThreshold: 50,
            volumeThreshold: 10
        });

        // Initialize metrics
        const registry = new Registry();
        this.metrics = new Counter({
            name: 'salesforce_operations_total',
            help: 'Total Salesforce operations',
            labelNames: ['operation', 'status'],
            registers: [registry]
        });

        // Initialize logger
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.combine(
                winston.format.timestamp(),
                winston.format.json()
            ),
            transports: [
                new winston.transports.File({ filename: 'salesforce-error.log', level: 'error' }),
                new winston.transports.File({ filename: 'salesforce.log' })
            ]
        });

        if (process.env.NODE_ENV !== 'production') {
            this.logger.add(new winston.transports.Console({
                format: winston.format.simple()
            }));
        }
    }

    /**
     * Authenticates with Salesforce using OAuth2 with token refresh
     */
    public async authenticate(authCode: string): Promise<void> {
        try {
            this.metrics.inc({ operation: 'authenticate', status: 'attempt' });

            this.connection = new jsforce.Connection({
                oauth2: {
                    clientId: this.config.clientId,
                    clientSecret: this.config.clientSecret,
                    redirectUri: this.config.redirectUri
                },
                version: this.config.apiVersion
            });

            await this.connection.authorize(authCode);

            // Store encrypted credentials
            const encryptedToken = this.encryptToken(this.connection.accessToken);
            await this.cache.set(
                'salesforce_token',
                encryptedToken,
                'EX',
                this.connection.oauth2.refreshToken ? 7200 : 3600
            );

            // Set up token refresh monitoring
            if (this.connection.oauth2.refreshToken) {
                this.monitorTokenRefresh();
            }

            this.metrics.inc({ operation: 'authenticate', status: 'success' });
            this.logger.info('Salesforce authentication successful');
        } catch (error) {
            this.metrics.inc({ operation: 'authenticate', status: 'error' });
            this.logger.error('Salesforce authentication failed', { error });
            throw error;
        }
    }

    /**
     * Synchronizes lead data with Salesforce using circuit breaker
     */
    public async syncLead(lead: ILead): Promise<string> {
        const operation = 'syncLead';
        const startTime = Date.now();

        try {
            this.metrics.inc({ operation, status: 'attempt' });

            // Validate lead data
            this.validateLeadData(lead);

            // Check cache for existing mapping
            const existingSfId = await this.cache.get(`lead_mapping:${lead.id}`);
            if (existingSfId) {
                return existingSfId;
            }

            // Map lead data to Salesforce format
            const sfLead = this.mapLeadToSalesforce(lead);

            // Execute upsert with circuit breaker
            const result = await this.circuitBreaker.execute(async () => {
                const response = await this.connection.sobject('Lead').upsert(sfLead, 'External_Id__c');
                return response;
            });

            // Store mapping in cache
            await this.cache.set(
                `lead_mapping:${lead.id}`,
                result.id,
                'EX',
                86400 // 24 hours
            );

            // Update metrics and logs
            const duration = Date.now() - startTime;
            this.recordMetrics({
                operationType: operation,
                duration,
                success: true,
                timestamp: new Date()
            });

            this.logger.info('Lead synced successfully', {
                leadId: lead.id,
                salesforceId: result.id,
                duration
            });

            return result.id;
        } catch (error) {
            const duration = Date.now() - startTime;
            this.handleSyncError(error, operation, duration, lead);
            throw error;
        }
    }

    /**
     * Processes Salesforce webhook events with security verification
     */
    public async handleWebhook(payload: SalesforceWebhookPayload): Promise<void> {
        const startTime = Date.now();

        try {
            this.metrics.inc({ operation: 'webhook', status: 'attempt' });

            // Verify webhook signature
            this.verifyWebhookSignature(payload);

            // Process based on event type
            switch (payload.objectType) {
                case 'Lead':
                    await this.handleLeadWebhook(payload);
                    break;
                case 'Opportunity':
                    await this.handleOpportunityWebhook(payload);
                    break;
                default:
                    throw new Error(`Unsupported object type: ${payload.objectType}`);
            }

            const duration = Date.now() - startTime;
            this.recordMetrics({
                operationType: 'webhook',
                duration,
                success: true,
                timestamp: new Date()
            });

            this.logger.info('Webhook processed successfully', {
                objectType: payload.objectType,
                eventType: payload.eventType,
                duration
            });
        } catch (error) {
            const duration = Date.now() - startTime;
            this.handleWebhookError(error, duration, payload);
            throw error;
        }
    }

    /**
     * Private helper methods
     */
    private validateLeadData(lead: ILead): void {
        if (!lead.email || !lead.status) {
            throw new Error('Invalid lead data: missing required fields');
        }
    }

    private mapLeadToSalesforce(lead: ILead): Record<string, any> {
        return {
            External_Id__c: lead.id,
            Email: lead.email,
            Status: this.mapLeadStatus(lead.status),
            Company: lead.metadata.company,
            Industry: lead.metadata.industry,
            NumberOfEmployees: lead.metadata.companySize,
            LeadSource: 'Autonomous Revenue Platform',
            AI_Score__c: lead.metadata.aiScoreFactors.overall
        };
    }

    private mapLeadStatus(status: LeadStatus): string {
        const statusMap: Record<LeadStatus, string> = {
            [LeadStatus.NEW]: 'Open',
            [LeadStatus.QUALIFYING]: 'In Progress',
            [LeadStatus.QUALIFIED]: 'Qualified',
            [LeadStatus.NURTURING]: 'Nurturing',
            [LeadStatus.CONVERTED]: 'Converted',
            [LeadStatus.DISQUALIFIED]: 'Disqualified'
        };
        return statusMap[status] || 'Open';
    }

    private async handleLeadWebhook(payload: SalesforceWebhookPayload): Promise<void> {
        const client = await this.dbPool.connect();
        try {
            await client.query('BEGIN');
            // Update local lead record with Salesforce changes
            await client.query(
                'UPDATE leads SET salesforce_data = $1, updated_at = NOW() WHERE salesforce_id = $2',
                [payload.data, payload.data.Id]
            );
            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    private async handleOpportunityWebhook(payload: SalesforceWebhookPayload): Promise<void> {
        // Implementation for opportunity webhooks
        this.logger.info('Processing opportunity webhook', { payload });
    }

    private verifyWebhookSignature(payload: SalesforceWebhookPayload): void {
        const signature = crypto
            .createHmac('sha256', this.config.webhookSecret)
            .update(JSON.stringify(payload.data))
            .digest('hex');

        if (signature !== payload.signature) {
            throw new Error('Invalid webhook signature');
        }
    }

    private encryptToken(token: string): string {
        const cipher = crypto.createCipher('aes-256-cbc', process.env.ENCRYPTION_KEY || '');
        let encrypted = cipher.update(token, 'utf8', 'hex');
        encrypted += cipher.final('hex');
        return encrypted;
    }

    private monitorTokenRefresh(): void {
        setInterval(async () => {
            try {
                await this.connection.oauth2.refreshToken(this.connection.refreshToken);
                const encryptedToken = this.encryptToken(this.connection.accessToken);
                await this.cache.set('salesforce_token', encryptedToken, 'EX', 7200);
            } catch (error) {
                this.logger.error('Token refresh failed', { error });
            }
        }, 3600000); // Refresh every hour
    }

    private recordMetrics(metrics: SalesforceMetrics): void {
        this.metrics.inc({
            operation: metrics.operationType,
            status: metrics.success ? 'success' : 'error'
        });
    }

    private handleSyncError(error: any, operation: string, duration: number, lead: ILead): void {
        this.metrics.inc({ operation, status: 'error' });
        this.recordMetrics({
            operationType: operation,
            duration,
            success: false,
            errorType: error.name,
            timestamp: new Date()
        });
        this.logger.error('Lead sync failed', {
            error,
            leadId: lead.id,
            duration
        });
    }

    private handleWebhookError(error: any, duration: number, payload: SalesforceWebhookPayload): void {
        this.metrics.inc({ operation: 'webhook', status: 'error' });
        this.recordMetrics({
            operationType: 'webhook',
            duration,
            success: false,
            errorType: error.name,
            timestamp: new Date()
        });
        this.logger.error('Webhook processing failed', {
            error,
            payload,
            duration
        });
    }
}