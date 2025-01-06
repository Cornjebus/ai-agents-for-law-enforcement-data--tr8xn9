/**
 * @fileoverview Organization service implementation providing comprehensive organization management
 * with real-time updates, enhanced security, and AI configuration capabilities
 * @version 1.0.0
 */

import { Socket } from 'socket.io-client'; // v4.6.0
import { z } from 'zod'; // v3.21.4
import { ApiClient } from '../lib/api';
import { Organization, OrganizationSettings, OrganizationAIConfig, OrganizationStatus } from '../types/organization';

// Validation schemas for organization data
const organizationSettingsSchema = z.object({
  timezone: z.string(),
  businessHours: z.object({
    schedule: z.record(z.object({
      start: z.string(),
      end: z.string(),
      active: z.boolean()
    })),
    holidays: z.array(z.date()),
    overrides: z.record(z.object({
      start: z.string(),
      end: z.string()
    }))
  }),
  notifications: z.object({
    email: z.object({
      enabled: z.boolean(),
      recipients: z.array(z.string().email()),
      preferences: z.record(z.boolean())
    }),
    slack: z.object({
      enabled: z.boolean(),
      webhookUrl: z.string().url().optional(),
      channels: z.record(z.string())
    }),
    inApp: z.object({
      enabled: z.boolean(),
      preferences: z.record(z.boolean())
    })
  }),
  branding: z.object({
    logo: z.string().url().optional(),
    colors: z.record(z.string()),
    fonts: z.record(z.string())
  })
});

const aiConfigSchema = z.object({
  models: z.object({
    defaultModel: z.string(),
    temperature: z.number().min(0).max(1),
    maxTokens: z.number().positive(),
    topP: z.number().min(0).max(1)
  }),
  voice: z.object({
    defaultVoice: z.string(),
    speed: z.number().min(0.5).max(2.0),
    pitch: z.number()
  }),
  prompts: z.object({
    templates: z.record(z.string()),
    variables: z.record(z.string())
  }),
  safety: z.object({
    contentFilter: z.boolean(),
    maxConcurrentCalls: z.number().positive()
  })
});

/**
 * Service class for managing organization operations with enhanced security and real-time updates
 */
export class OrganizationService {
  private cache: Map<string, { data: Organization; timestamp: number }> = new Map();
  private updateSubscribers: Map<string, Set<(org: Organization) => void>> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    private readonly apiClient: ApiClient,
    private readonly socket: Socket
  ) {
    this.setupWebSocketListeners();
  }

  /**
   * Sets up WebSocket listeners for real-time organization updates
   */
  private setupWebSocketListeners(): void {
    this.socket.on('organization:update', (org: Organization) => {
      this.updateCache(org);
      this.notifySubscribers(org.id, org);
    });
  }

  /**
   * Updates the organization cache
   */
  private updateCache(org: Organization): void {
    this.cache.set(org.id, {
      data: org,
      timestamp: Date.now()
    });
  }

  /**
   * Notifies subscribers of organization updates
   */
  private notifySubscribers(orgId: string, org: Organization): void {
    const subscribers = this.updateSubscribers.get(orgId);
    if (subscribers) {
      subscribers.forEach(callback => callback(org));
    }
  }

  /**
   * Retrieves organization details by ID with caching
   */
  public async getOrganization(id: string): Promise<Organization> {
    // Check cache
    const cached = this.cache.get(id);
    if (cached && (Date.now() - cached.timestamp) < this.CACHE_TTL) {
      return cached.data;
    }

    // Fetch from API
    const org = await this.apiClient.request<Organization>('GET', `/organizations/${id}`);
    this.updateCache(org);
    return org;
  }

  /**
   * Updates organization details with validation
   */
  public async updateOrganization(
    id: string,
    updates: Partial<Organization>
  ): Promise<Organization> {
    // Validate settings if included in updates
    if (updates.settings) {
      organizationSettingsSchema.parse(updates.settings);
    }

    // Validate AI config if included in updates
    if (updates.aiConfig) {
      aiConfigSchema.parse(updates.aiConfig);
    }

    const updated = await this.apiClient.request<Organization>(
      'PUT',
      `/organizations/${id}`,
      { data: updates }
    );

    this.updateCache(updated);
    this.notifySubscribers(id, updated);
    return updated;
  }

  /**
   * Updates organization AI configuration with enhanced validation
   */
  public async updateAIConfig(
    id: string,
    aiConfig: OrganizationAIConfig
  ): Promise<Organization> {
    // Validate AI configuration
    aiConfigSchema.parse(aiConfig);

    const updated = await this.apiClient.request<Organization>(
      'PUT',
      `/organizations/${id}/ai-config`,
      { data: { aiConfig } }
    );

    this.updateCache(updated);
    this.notifySubscribers(id, updated);
    return updated;
  }

  /**
   * Updates organization settings with validation
   */
  public async updateSettings(
    id: string,
    settings: OrganizationSettings
  ): Promise<Organization> {
    // Validate settings
    organizationSettingsSchema.parse(settings);

    const updated = await this.apiClient.request<Organization>(
      'PUT',
      `/organizations/${id}/settings`,
      { data: { settings } }
    );

    this.updateCache(updated);
    this.notifySubscribers(id, updated);
    return updated;
  }

  /**
   * Updates organization status with validation
   */
  public async updateStatus(
    id: string,
    status: OrganizationStatus
  ): Promise<Organization> {
    const updated = await this.apiClient.request<Organization>(
      'PUT',
      `/organizations/${id}/status`,
      { data: { status } }
    );

    this.updateCache(updated);
    this.notifySubscribers(id, updated);
    return updated;
  }

  /**
   * Subscribes to real-time organization updates
   */
  public subscribeToUpdates(
    id: string,
    callback: (org: Organization) => void
  ): () => void {
    if (!this.updateSubscribers.has(id)) {
      this.updateSubscribers.set(id, new Set());
    }

    const subscribers = this.updateSubscribers.get(id)!;
    subscribers.add(callback);

    // Join organization's real-time update room
    this.socket.emit('organization:join', id);

    // Return unsubscribe function
    return () => {
      subscribers.delete(callback);
      if (subscribers.size === 0) {
        this.updateSubscribers.delete(id);
        this.socket.emit('organization:leave', id);
      }
    };
  }

  /**
   * Clears organization cache
   */
  public clearCache(): void {
    this.cache.clear();
  }
}