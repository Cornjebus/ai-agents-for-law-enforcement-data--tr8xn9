import { injectable } from 'inversify';
import { Client as HubSpotClient } from '@hubspot/api-client'; // v9.0.0
import axios from 'axios'; // v1.4.0
import { createHmac } from 'crypto';
import winston from 'winston'; // v3.8.0
import NodeCache from 'node-cache'; // v5.1.2
import { ILead, LeadStatus, LeadMetadata } from '../../common/interfaces/lead.interface';

/**
 * Configuration interface for HubSpot retry strategy
 */
interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
}

/**
 * Service class for managing HubSpot CRM integration with enhanced security and error handling
 */
@injectable()
export class HubSpotService {
  private hubspotClient: HubSpotClient;
  private readonly apiKey: string;
  private readonly baseUrl: string = 'https://api.hubapi.com';
  private readonly cache: NodeCache;
  private readonly logger: winston.Logger;
  private readonly retryConfig: RetryConfig;
  private readonly webhookSecret: string;

  constructor(
    apiKey: string,
    webhookSecret: string,
    cache: NodeCache,
    logger: winston.Logger
  ) {
    this.apiKey = apiKey;
    this.webhookSecret = webhookSecret;
    this.cache = cache;
    this.logger = logger;

    // Initialize HubSpot client
    this.hubspotClient = new HubSpotClient({ accessToken: this.apiKey });

    // Configure retry strategy
    this.retryConfig = {
      maxRetries: 3,
      initialDelay: 1000,
      maxDelay: 5000
    };

    this.validateConnection();
  }

  /**
   * Validates HubSpot API connection and credentials
   */
  private async validateConnection(): Promise<void> {
    try {
      await this.hubspotClient.oauth.accessTokensApi.get();
      this.logger.info('HubSpot connection validated successfully');
    } catch (error) {
      this.logger.error('HubSpot connection validation failed', { error });
      throw new Error('Failed to validate HubSpot connection');
    }
  }

  /**
   * Implements exponential backoff retry logic
   */
  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    let delay = this.retryConfig.initialDelay;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        if (attempt === this.retryConfig.maxRetries) throw error;
        
        await new Promise(resolve => setTimeout(resolve, delay));
        delay = Math.min(delay * 2, this.retryConfig.maxDelay);
        
        this.logger.warn('Retrying HubSpot operation', { attempt, delay });
      }
    }
    throw new Error('Retry operation failed');
  }

  /**
   * Maps platform lead data to HubSpot contact format
   */
  private mapLeadToContact(lead: ILead): any {
    return {
      properties: {
        email: lead.email,
        firstname: lead.firstName,
        lastname: lead.lastName,
        company: lead.company,
        jobtitle: lead.title,
        phone: lead.phone,
        lead_score: lead.score.toString(),
        lead_status: lead.status,
        lead_source: lead.source,
        industry: lead.metadata.industry,
        company_size: lead.metadata.companySize,
        location: lead.metadata.location,
        budget: lead.metadata.budget
      }
    };
  }

  /**
   * Synchronizes lead data with HubSpot contacts using retry logic and caching
   */
  public async syncLead(lead: ILead): Promise<void> {
    const cacheKey = `hubspot_contact_${lead.email}`;
    let hubspotContactId = this.cache.get<string>(cacheKey);

    try {
      if (!hubspotContactId) {
        const contactData = this.mapLeadToContact(lead);
        
        const response = await this.withRetry(async () => {
          const searchResult = await this.hubspotClient.crm.contacts.searchApi.doSearch({
            filterGroups: [{
              filters: [{
                propertyName: 'email',
                operator: 'EQ',
                value: lead.email
              }]
            }]
          });

          if (searchResult.total > 0) {
            return searchResult.results[0];
          }

          return await this.hubspotClient.crm.contacts.basicApi.create(contactData);
        });

        hubspotContactId = response.id;
        this.cache.set(cacheKey, hubspotContactId, 3600); // Cache for 1 hour
      }

      // Update contact properties
      await this.withRetry(() =>
        this.hubspotClient.crm.contacts.basicApi.update(hubspotContactId!, this.mapLeadToContact(lead))
      );

      this.logger.info('Lead synchronized with HubSpot', { leadId: lead.id, hubspotContactId });
    } catch (error) {
      this.logger.error('Failed to sync lead with HubSpot', { error, leadId: lead.id });
      throw error;
    }
  }

  /**
   * Creates a deal in HubSpot for qualified leads with validation
   */
  public async createDeal(lead: ILead): Promise<string> {
    if (lead.status !== LeadStatus.QUALIFIED) {
      throw new Error('Cannot create deal for unqualified lead');
    }

    try {
      const dealData = {
        properties: {
          dealname: `${lead.company} - ${lead.metadata.budget}`,
          pipeline: 'default',
          dealstage: 'qualifiedtobuy',
          amount: lead.metadata.budget,
          lead_source: lead.source
        }
      };

      const deal = await this.withRetry(() =>
        this.hubspotClient.crm.deals.basicApi.create(dealData)
      );

      // Associate deal with contact
      const contactId = this.cache.get<string>(`hubspot_contact_${lead.email}`);
      if (contactId) {
        await this.withRetry(() =>
          this.hubspotClient.crm.deals.associationsApi.create(
            deal.id,
            'contacts',
            contactId,
            'deal_to_contact'
          )
        );
      }

      this.logger.info('Deal created in HubSpot', { leadId: lead.id, dealId: deal.id });
      return deal.id;
    } catch (error) {
      this.logger.error('Failed to create deal in HubSpot', { error, leadId: lead.id });
      throw error;
    }
  }

  /**
   * Syncs lead interactions as HubSpot engagement events with batching
   */
  public async syncInteractions(lead: ILead): Promise<void> {
    try {
      const batchSize = 100;
      const interactions = lead.interactions;
      
      for (let i = 0; i < interactions.length; i += batchSize) {
        const batch = interactions.slice(i, i + batchSize);
        
        await Promise.all(batch.map(async interaction => {
          const engagementData = {
            properties: {
              type: interaction.type,
              timestamp: interaction.timestamp.getTime(),
              content: interaction.content,
              channel: interaction.channel,
              sentiment: interaction.sentiment,
              ai_analysis: JSON.stringify(interaction.aiAnalysis)
            }
          };

          await this.withRetry(() =>
            this.hubspotClient.crm.engagements.basicApi.create(engagementData)
          );
        }));
      }

      this.logger.info('Lead interactions synced with HubSpot', { 
        leadId: lead.id, 
        interactionCount: interactions.length 
      });
    } catch (error) {
      this.logger.error('Failed to sync interactions with HubSpot', { 
        error, 
        leadId: lead.id 
      });
      throw error;
    }
  }

  /**
   * Imports leads from HubSpot with advanced filtering and pagination
   */
  public async importLeads(filters: Record<string, any> = {}): Promise<ILead[]> {
    const importedLeads: ILead[] = [];
    let after: string | undefined;

    try {
      do {
        const response = await this.withRetry(() =>
          this.hubspotClient.crm.contacts.searchApi.doSearch({
            filterGroups: [{
              filters: Object.entries(filters).map(([property, value]) => ({
                propertyName: property,
                operator: 'EQ',
                value: value.toString()
              }))
            }],
            properties: ['email', 'firstname', 'lastname', 'company', 'jobtitle', 'phone'],
            after
          })
        );

        const leads = response.results.map(contact => ({
          id: crypto.randomUUID(),
          email: contact.properties.email,
          firstName: contact.properties.firstname,
          lastName: contact.properties.lastname,
          company: contact.properties.company,
          title: contact.properties.jobtitle,
          phone: contact.properties.phone,
          status: LeadStatus.NEW,
          score: 0,
          metadata: {} as LeadMetadata,
          interactions: [],
          createdAt: new Date(),
          updatedAt: new Date()
        } as ILead));

        importedLeads.push(...leads);
        after = response.paging?.next?.after;
      } while (after);

      this.logger.info('Leads imported from HubSpot', { 
        count: importedLeads.length, 
        filters 
      });

      return importedLeads;
    } catch (error) {
      this.logger.error('Failed to import leads from HubSpot', { error, filters });
      throw error;
    }
  }

  /**
   * Handles incoming webhooks from HubSpot with signature validation
   */
  public async webhookHandler(payload: any, signature: string): Promise<void> {
    // Validate webhook signature
    const calculatedSignature = createHmac('sha256', this.webhookSecret)
      .update(JSON.stringify(payload))
      .digest('hex');

    if (calculatedSignature !== signature) {
      this.logger.error('Invalid webhook signature');
      throw new Error('Invalid webhook signature');
    }

    try {
      const { subscriptionType, eventId, objectId, propertyName, propertyValue } = payload;
      
      switch (subscriptionType) {
        case 'contact.propertyChange':
          // Handle contact property changes
          this.cache.del(`hubspot_contact_${objectId}`);
          break;
        
        case 'contact.deletion':
          // Handle contact deletion
          this.cache.del(`hubspot_contact_${objectId}`);
          break;
        
        case 'deal.propertyChange':
          // Handle deal property changes
          break;
        
        default:
          this.logger.warn('Unhandled webhook event type', { subscriptionType });
      }

      this.logger.info('Webhook processed successfully', { 
        eventId, 
        subscriptionType 
      });
    } catch (error) {
      this.logger.error('Failed to process webhook', { error, payload });
      throw error;
    }
  }
}