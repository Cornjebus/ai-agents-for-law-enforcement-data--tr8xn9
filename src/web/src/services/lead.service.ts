/**
 * @fileoverview Advanced service class for managing lead-related operations with AI integration
 * Implements lead management, scoring, real-time updates, and analytics integration
 * Version: 1.0.0
 */

import { Subject, BehaviorSubject, Observable, timer } from 'rxjs'; // v7.8.1
import { map, retryWhen, delay, take } from 'rxjs/operators';
import * as qs from 'qs'; // v6.11.2
import { caching } from 'cache-manager'; // v5.2.3
import { ApiClient } from '../lib/api';
import { ILead, LeadStatus, IAIScore, INextAction } from '../types/lead';

// Constants for service configuration
const LEAD_CACHE_TTL = 300000; // 5 minutes
const BATCH_SIZE = 50;
const RETRY_ATTEMPTS = 3;
const REAL_TIME_UPDATE_INTERVAL = 30000; // 30 seconds

// API endpoints for lead operations
const LEAD_ENDPOINTS = {
    BASE: '/api/v1/leads',
    AI_SCORE: '/api/v1/leads/:id/score',
    BATCH_UPDATE: '/api/v1/leads/batch',
    REAL_TIME_UPDATES: '/api/v1/leads/stream'
};

/**
 * Interface for lead update options
 */
interface UpdateOptions {
    refreshCache?: boolean;
    notifyUpdates?: boolean;
    optimizeAIScore?: boolean;
}

/**
 * Interface for batch update results
 */
interface BatchUpdateResult {
    success: boolean;
    updatedCount: number;
    failedIds: string[];
    errors: Record<string, string>;
}

/**
 * Advanced service class for managing lead-related operations
 */
export class LeadService {
    private leadUpdates$ = new BehaviorSubject<ILead[]>([]);
    private cacheManager: any;
    private updateSubscription: any;

    constructor(
        private apiClient: ApiClient
    ) {
        this.initializeCache();
        this.setupRealtimeUpdates();
    }

    /**
     * Initialize caching system with TTL support
     */
    private async initializeCache(): Promise<void> {
        this.cacheManager = await caching('memory', {
            max: 100,
            ttl: LEAD_CACHE_TTL
        });
    }

    /**
     * Setup real-time updates for lead data
     */
    private setupRealtimeUpdates(): void {
        this.updateSubscription = timer(0, REAL_TIME_UPDATE_INTERVAL).subscribe(() => {
            this.fetchRealtimeUpdates();
        });
    }

    /**
     * Fetch real-time updates for leads
     */
    private async fetchRealtimeUpdates(): Promise<void> {
        try {
            const response = await this.apiClient.get(LEAD_ENDPOINTS.REAL_TIME_UPDATES);
            if (response.data) {
                this.leadUpdates$.next(response.data);
                await this.updateCache(response.data);
            }
        } catch (error) {
            console.error('Real-time update error:', error);
        }
    }

    /**
     * Update cache with new lead data
     */
    private async updateCache(leads: ILead[]): Promise<void> {
        for (const lead of leads) {
            await this.cacheManager.set(
                `lead_${lead.id}`,
                lead,
                { ttl: LEAD_CACHE_TTL }
            );
        }
    }

    /**
     * Get leads with AI-generated qualification scores
     */
    public async getLeadsWithAIScore(
        filters: {
            status?: LeadStatus[];
            scoreRange?: { min: number; max: number };
            campaignId?: string;
        },
        pagination: { page: number; limit: number },
        useCache: boolean = true
    ): Promise<{ data: ILead[]; total: number; aiInsights: any }> {
        const cacheKey = `leads_${JSON.stringify(filters)}_${JSON.stringify(pagination)}`;

        if (useCache) {
            const cached = await this.cacheManager.get(cacheKey);
            if (cached) return cached;
        }

        const queryString = qs.stringify({
            ...filters,
            ...pagination,
            includeAIScore: true
        }, { arrayFormat: 'brackets' });

        const response = await this.apiClient.get(
            `${LEAD_ENDPOINTS.BASE}?${queryString}`
        );

        const result = {
            data: response.data.leads,
            total: response.data.total,
            aiInsights: response.data.aiInsights
        };

        await this.cacheManager.set(cacheKey, result, { ttl: LEAD_CACHE_TTL });
        return result;
    }

    /**
     * Perform batch updates on multiple leads
     */
    public async batchUpdateLeads(
        leads: Partial<ILead>[],
        options: UpdateOptions = {}
    ): Promise<BatchUpdateResult> {
        const batches = this.chunkArray(leads, BATCH_SIZE);
        const results: BatchUpdateResult = {
            success: true,
            updatedCount: 0,
            failedIds: [],
            errors: {}
        };

        for (const batch of batches) {
            try {
                const response = await this.apiClient.post(
                    LEAD_ENDPOINTS.BATCH_UPDATE,
                    { leads: batch, options }
                );

                results.updatedCount += response.data.updatedCount;

                if (response.data.failedIds) {
                    results.failedIds.push(...response.data.failedIds);
                    results.errors = { ...results.errors, ...response.data.errors };
                }

                if (options.refreshCache) {
                    await this.updateCache(response.data.updatedLeads);
                }

                if (options.notifyUpdates) {
                    this.leadUpdates$.next(response.data.updatedLeads);
                }
            } catch (error) {
                results.success = false;
                results.errors[batch[0].id] = error.message;
            }
        }

        return results;
    }

    /**
     * Get AI-generated next actions for a lead
     */
    public async getNextActions(leadId: string): Promise<INextAction[]> {
        const cacheKey = `next_actions_${leadId}`;
        const cached = await this.cacheManager.get(cacheKey);
        if (cached) return cached;

        const response = await this.apiClient.get(
            `${LEAD_ENDPOINTS.BASE}/${leadId}/next-actions`
        );

        await this.cacheManager.set(cacheKey, response.data, { ttl: LEAD_CACHE_TTL });
        return response.data;
    }

    /**
     * Update AI score for a lead
     */
    public async updateAIScore(leadId: string): Promise<IAIScore> {
        const response = await this.apiClient.post(
            LEAD_ENDPOINTS.AI_SCORE.replace(':id', leadId)
        );

        await this.cacheManager.del(`lead_${leadId}`);
        return response.data;
    }

    /**
     * Get real-time lead updates as observable
     */
    public getLeadUpdates(): Observable<ILead[]> {
        return this.leadUpdates$.asObservable();
    }

    /**
     * Utility function to chunk array for batch processing
     */
    private chunkArray<T>(array: T[], size: number): T[][] {
        return Array.from({ length: Math.ceil(array.length / size) }, (_, index) =>
            array.slice(index * size, (index + 1) * size)
        );
    }

    /**
     * Cleanup resources on service destruction
     */
    public destroy(): void {
        if (this.updateSubscription) {
            this.updateSubscription.unsubscribe();
        }
        this.leadUpdates$.complete();
    }
}

// Export singleton instance
export const leadService = new LeadService(new ApiClient());