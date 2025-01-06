// External dependencies
// zod v3.22.0
import { z } from 'zod';
// validator v13.11.0
import { isEmail, isURL } from 'validator';
// rate-limiter-flexible v2.4.1
import { RateLimiter } from 'rate-limiter-flexible';
// node-cache v5.1.2
import NodeCache from 'node-cache';

// Internal interfaces
import { Campaign, CampaignStatus, CampaignType } from '../interfaces/campaign.interface';
import { IContent, ContentStatus } from '../interfaces/content.interface';
import { ILead, LeadStatus, LeadSource } from '../interfaces/lead.interface';

// Initialize rate limiter for validation calls
const validationRateLimiter = new RateLimiter({
  points: 1000, // Number of validation calls
  duration: 60, // Per minute
});

// Initialize validation cache with 5 minute TTL
const validationCache = new NodeCache({
  stdTTL: 300,
  checkperiod: 60,
});

/**
 * Custom validation error class with enhanced error tracking
 */
export class ValidationError extends Error {
  public readonly errors: Record<string, string[]>;
  public readonly errorCode: string;
  public readonly timestamp: Date;

  constructor(message: string, errors: Record<string, string[]>, errorCode: string) {
    super(message);
    this.name = 'ValidationError';
    this.errors = errors;
    this.errorCode = errorCode;
    this.timestamp = new Date();
    
    // Log validation error for monitoring
    console.error('Validation Error:', {
      message,
      errors,
      errorCode,
      timestamp: this.timestamp,
    });
  }
}

/**
 * Validates campaign data against schema and business rules with caching
 */
export async function validateCampaign(campaign: Partial<Campaign>): Promise<void> {
  // Check rate limit
  await validationRateLimiter.consume('campaign-validation', 1);

  // Check cache
  const cacheKey = `campaign-${JSON.stringify(campaign)}`;
  const cachedResult = validationCache.get(cacheKey);
  if (cachedResult) return;

  // Campaign schema validation
  const campaignSchema = z.object({
    name: z.string().min(3).max(100),
    description: z.string().max(1000).optional(),
    status: z.nativeEnum(CampaignStatus),
    type: z.nativeEnum(CampaignType),
    startDate: z.date().min(new Date()),
    endDate: z.date().nullable(),
    budget: z.object({
      totalBudget: z.number().positive(),
      dailyLimit: z.number().positive(),
      currency: z.string().length(3),
    }),
    targeting: z.object({
      audience: z.object({
        industries: z.array(z.string()),
        companySize: z.array(z.string()),
        roles: z.array(z.string()),
        geography: z.array(z.string()),
      }),
    }).strict(),
  }).strict();

  try {
    // Validate schema
    campaignSchema.parse(campaign);

    // Validate business rules
    if (campaign.endDate && campaign.startDate && campaign.endDate <= campaign.startDate) {
      throw new ValidationError(
        'Invalid campaign dates',
        { dates: ['End date must be after start date'] },
        'CAMPAIGN_001'
      );
    }

    // Cache successful validation
    validationCache.set(cacheKey, true);

  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        'Campaign validation failed',
        error.errors.reduce((acc, err) => {
          acc[err.path.join('.')] = [err.message];
          return acc;
        }, {} as Record<string, string[]>),
        'CAMPAIGN_002'
      );
    }
    throw error;
  }
}

/**
 * Validates content data against schema and business rules with security checks
 */
export async function validateContent(content: Partial<IContent>): Promise<void> {
  // Check rate limit
  await validationRateLimiter.consume('content-validation', 1);

  // Check cache
  const cacheKey = `content-${JSON.stringify(content)}`;
  const cachedResult = validationCache.get(cacheKey);
  if (cachedResult) return;

  // Content schema validation
  const contentSchema = z.object({
    type: z.nativeEnum(ContentType),
    platform: z.nativeEnum(ContentPlatform),
    content: z.string().min(1).max(50000),
    status: z.nativeEnum(ContentStatus),
    metadata: z.object({
      title: z.string().min(3).max(200),
      description: z.string().max(1000),
      keywords: z.array(z.string()),
      language: z.string().length(2),
    }).strict(),
    scheduledFor: z.date().min(new Date()),
  }).strict();

  try {
    // Validate schema
    contentSchema.parse(content);

    // Validate URLs in content
    if (content.content && content.content.includes('http')) {
      const urls = content.content.match(/https?:\/\/[^\s]+/g) || [];
      for (const url of urls) {
        if (!isURL(url)) {
          throw new ValidationError(
            'Invalid URL in content',
            { content: [`Invalid URL found: ${url}`] },
            'CONTENT_001'
          );
        }
      }
    }

    // Cache successful validation
    validationCache.set(cacheKey, true);

  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        'Content validation failed',
        error.errors.reduce((acc, err) => {
          acc[err.path.join('.')] = [err.message];
          return acc;
        }, {} as Record<string, string[]>),
        'CONTENT_002'
      );
    }
    throw error;
  }
}

/**
 * Validates lead data against schema and business rules with PII protection
 */
export async function validateLead(lead: Partial<ILead>): Promise<void> {
  // Check rate limit
  await validationRateLimiter.consume('lead-validation', 1);

  // Check cache
  const cacheKey = `lead-${JSON.stringify(lead)}`;
  const cachedResult = validationCache.get(cacheKey);
  if (cachedResult) return;

  // Lead schema validation
  const leadSchema = z.object({
    email: z.string().email(),
    firstName: z.string().min(1).max(50),
    lastName: z.string().min(1).max(50),
    company: z.string().min(1).max(100),
    title: z.string().max(100),
    phone: z.string().regex(/^\+?[1-9]\d{1,14}$/),
    score: z.number().min(0).max(100),
    status: z.nativeEnum(LeadStatus),
    source: z.nativeEnum(LeadSource),
    gdprConsent: z.object({
      marketing: z.boolean(),
      dataProcessing: z.boolean(),
      thirdPartySharing: z.boolean(),
      consentDate: z.date(),
      consentSource: z.string(),
    }).strict(),
  }).strict();

  try {
    // Validate schema
    leadSchema.parse(lead);

    // Validate email format
    if (lead.email && !isEmail(lead.email)) {
      throw new ValidationError(
        'Invalid email format',
        { email: ['Invalid email address format'] },
        'LEAD_001'
      );
    }

    // Validate GDPR consent
    if (lead.gdprConsent && !lead.gdprConsent.consentDate) {
      throw new ValidationError(
        'Missing GDPR consent date',
        { gdpr: ['Consent date is required'] },
        'LEAD_002'
      );
    }

    // Cache successful validation
    validationCache.set(cacheKey, true);

  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new ValidationError(
        'Lead validation failed',
        error.errors.reduce((acc, err) => {
          acc[err.path.join('.')] = [err.message];
          return acc;
        }, {} as Record<string, string[]>),
        'LEAD_003'
      );
    }
    throw error;
  }
}