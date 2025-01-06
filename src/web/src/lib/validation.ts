/**
 * @fileoverview Enterprise-grade validation library with comprehensive schema validation,
 * form validation, and data validation utilities with enhanced security controls
 * @version 1.0.0
 */

import { z } from 'zod'; // v3.22.0
import { isEmail } from 'validator'; // v13.11.0
import sanitizeHtml from 'sanitize-html'; // v2.11.0
import xss from 'xss'; // v1.0.14

import { ICampaign, CampaignType, CampaignStatus } from '../types/campaign';
import { Content, ContentType, ContentStatus, ContentPlatform } from '../types/content';
import { ILead, LeadStatus, LeadSource } from '../types/lead';

// Global validation constants
const EMAIL_REGEX = /^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i;
const PHONE_REGEX = /^\+?[1-9]\d{1,14}$/;
const URL_REGEX = /^https?:\/\/[\w\d\-._~:/?#[\]@!$&'()*+,;=]+$/;
const VALIDATION_CACHE_TTL = 300; // 5 minutes
const MAX_VALIDATION_ATTEMPTS = 3;
const VALIDATION_TIMEOUT = 5000; // 5 seconds

/**
 * Enhanced campaign validation schema with security controls
 */
export const campaignSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  name: z.string().min(3).max(100).transform(xss),
  description: z.string().max(1000).transform(sanitizeHtml),
  type: z.nativeEnum(CampaignType),
  status: z.nativeEnum(CampaignStatus),
  config: z.object({
    budget: z.object({
      daily: z.number().positive(),
      total: z.number().positive(),
      alerts: z.object({
        threshold: z.number().min(0).max(1),
        email: z.array(z.string().email())
      })
    }),
    targeting: z.object({
      audience: z.array(z.string()),
      locations: z.array(z.object({
        type: z.string(),
        coordinates: z.array(z.number()).length(2)
      })),
      interests: z.array(z.string()),
      exclusions: z.array(z.string())
    }),
    aiConfig: z.object({
      model: z.string(),
      temperature: z.number().min(0).max(1),
      maxTokens: z.number().positive(),
      contextWindow: z.number().positive()
    })
  }),
  startDate: z.date(),
  endDate: z.date().nullable(),
  createdAt: z.date(),
  updatedAt: z.date()
});

/**
 * Enhanced content validation schema with sanitization
 */
export const contentSchema = z.object({
  id: z.string().uuid(),
  campaignId: z.string().uuid(),
  type: z.nativeEnum(ContentType),
  platform: z.nativeEnum(ContentPlatform),
  content: z.string().transform((val) => sanitizeHtml(val, {
    allowedTags: ['b', 'i', 'em', 'strong', 'p', 'br'],
    allowedAttributes: {}
  })),
  metadata: z.object({
    title: z.string().max(200).transform(xss),
    description: z.string().max(1000).transform(sanitizeHtml),
    keywords: z.array(z.string()),
    language: z.string(),
    targetAudience: z.array(z.string()),
    aiModel: z.string(),
    generationPrompt: z.string().max(2000)
  }),
  status: z.nativeEnum(ContentStatus),
  scheduledFor: z.date(),
  createdAt: z.date(),
  updatedAt: z.date()
});

/**
 * Enhanced lead validation schema with data protection
 */
export const leadSchema = z.object({
  id: z.string().uuid(),
  organizationId: z.string().uuid(),
  campaignId: z.string().uuid(),
  firstName: z.string().min(1).max(50).transform(xss),
  lastName: z.string().min(1).max(50).transform(xss),
  email: z.string().email().refine((val) => isEmail(val)),
  phone: z.string().regex(PHONE_REGEX),
  company: z.string().min(1).max(100).transform(xss),
  title: z.string().max(100).transform(xss),
  status: z.nativeEnum(LeadStatus),
  source: z.nativeEnum(LeadSource),
  score: z.number().min(0).max(100),
  metadata: z.object({
    industry: z.string().optional(),
    companySize: z.string().optional(),
    budget: z.string().optional(),
    timeline: z.string().optional(),
    technographics: z.array(z.string()).optional(),
    socialProfiles: z.object({
      linkedin: z.string().url().optional(),
      twitter: z.string().url().optional(),
      other: z.record(z.string()).optional()
    }).optional()
  })
});

/**
 * Validation result interface with security warnings
 */
interface ValidationResult<T> {
  isValid: boolean;
  data?: T;
  errors?: z.ZodError;
  securityWarnings?: string[];
  performance?: {
    duration: number;
    cached: boolean;
  };
}

/**
 * Centralized validation service with caching and monitoring
 */
export class ValidationService {
  private cache: Map<string, ValidationResult<unknown>>;
  private metrics: {
    validationCount: number;
    errorCount: number;
    averageDuration: number;
  };

  constructor() {
    this.cache = new Map();
    this.metrics = {
      validationCount: 0,
      errorCount: 0,
      averageDuration: 0
    };
  }

  /**
   * Validates data against schema with caching and security controls
   */
  public async validateData<T>(
    data: unknown,
    schema: z.ZodSchema,
    options: {
      cacheKey?: string;
      enableCache?: boolean;
      timeout?: number;
    } = {}
  ): Promise<ValidationResult<T>> {
    const startTime = performance.now();
    const cacheKey = options.cacheKey || JSON.stringify(data);

    // Check cache if enabled
    if (options.enableCache !== false) {
      const cached = this.cache.get(cacheKey);
      if (cached) {
        return {
          ...cached,
          performance: {
            duration: 0,
            cached: true
          }
        };
      }
    }

    try {
      // Validate with timeout
      const validationPromise = new Promise<ValidationResult<T>>((resolve, reject) => {
        setTimeout(() => reject(new Error('Validation timeout')), options.timeout || VALIDATION_TIMEOUT);

        try {
          const validated = schema.parse(data);
          resolve({
            isValid: true,
            data: validated as T,
            securityWarnings: this.checkSecurityWarnings(data)
          });
        } catch (error) {
          if (error instanceof z.ZodError) {
            resolve({
              isValid: false,
              errors: error,
              securityWarnings: this.checkSecurityWarnings(data)
            });
          } else {
            reject(error);
          }
        }
      });

      const result = await validationPromise;
      const duration = performance.now() - startTime;

      // Update metrics
      this.updateMetrics(result.isValid, duration);

      // Cache result if enabled
      if (options.enableCache !== false) {
        this.cache.set(cacheKey, result);
        setTimeout(() => this.cache.delete(cacheKey), VALIDATION_CACHE_TTL * 1000);
      }

      return {
        ...result,
        performance: {
          duration,
          cached: false
        }
      };
    } catch (error) {
      this.metrics.errorCount++;
      throw error;
    }
  }

  /**
   * Checks for common security issues in data
   */
  private checkSecurityWarnings(data: unknown): string[] {
    const warnings: string[] = [];
    const stringData = JSON.stringify(data);

    if (stringData.includes('<script')) {
      warnings.push('Potential XSS attack detected');
    }
    if (stringData.includes('javascript:')) {
      warnings.push('Potential malicious URL detected');
    }
    if (stringData.length > 1000000) {
      warnings.push('Large payload detected');
    }

    return warnings;
  }

  /**
   * Updates validation metrics
   */
  private updateMetrics(isValid: boolean, duration: number): void {
    this.metrics.validationCount++;
    if (!isValid) this.metrics.errorCount++;
    
    // Update running average duration
    this.metrics.averageDuration = (
      (this.metrics.averageDuration * (this.metrics.validationCount - 1) + duration) /
      this.metrics.validationCount
    );
  }

  /**
   * Returns current validation metrics
   */
  public getMetrics() {
    return {
      ...this.metrics,
      errorRate: this.metrics.errorCount / this.metrics.validationCount,
      cacheSize: this.cache.size
    };
  }
}