/**
 * Core utility functions for frontend application with strict type safety and security controls
 * @version 1.0.0
 */

import { isValid } from 'date-fns'; // v2.30.0
import clsx from 'clsx'; // v2.0.0
import { MetricType } from '../types/analytics';
import { CampaignType } from '../types/campaign';

// Constants for configuration and validation
const ID_PREFIX = 'id_';
const VALID_CLASS_TYPES = ['string', 'object', 'undefined', 'null'] as const;
const MAX_ID_GENERATION_RATE = 100; // per second
const DATE_VALIDATION_RANGE = {
  min: new Date('1900-01-01'),
  max: new Date('2100-12-31')
} as const;

// Rate limiting for ID generation
let lastGenerationTimestamp = 0;
let generationCount = 0;

/**
 * Enhanced date validation with explicit type checking and error handling
 * @param value - Value to validate as date
 * @returns boolean indicating if value is a valid date within acceptable range
 */
export function isValidDate(value: unknown): boolean {
  try {
    if (value instanceof Date) {
      if (!isValid(value)) return false;
      return value >= DATE_VALIDATION_RANGE.min && value <= DATE_VALIDATION_RANGE.max;
    }

    if (typeof value === 'string') {
      const dateObj = new Date(value);
      if (!isValid(dateObj)) return false;
      return dateObj >= DATE_VALIDATION_RANGE.min && dateObj <= DATE_VALIDATION_RANGE.max;
    }

    return false;
  } catch (error) {
    console.error('Date validation error:', error);
    return false;
  }
}

/**
 * Secure unique identifier generation with crypto API and rate limiting
 * @returns Cryptographically secure unique identifier string
 * @throws Error if generation rate limit exceeded
 */
export function generateId(): string {
  const now = Date.now();
  
  // Rate limiting check
  if (now - lastGenerationTimestamp < 1000) {
    if (generationCount >= MAX_ID_GENERATION_RATE) {
      throw new Error('ID generation rate limit exceeded');
    }
    generationCount++;
  } else {
    lastGenerationTimestamp = now;
    generationCount = 1;
  }

  // Generate secure random value using crypto API
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  
  // Convert to hex string with prefix and timestamp
  const randomHex = Array.from(array)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
    
  return `${ID_PREFIX}${now}_${randomHex}`;
}

/**
 * Optimized CSS class name concatenation with input sanitization
 * @param args - Array of class name arguments (strings, objects, or falsy values)
 * @returns Sanitized and concatenated class names string
 */
export function classNames(
  ...args: Array<string | Record<string, boolean> | null | undefined>
): string {
  // Validate input types
  const validatedArgs = args.filter(arg => {
    const type = typeof arg;
    return arg === null || VALID_CLASS_TYPES.includes(type as typeof VALID_CLASS_TYPES[number]);
  });

  // Use optimized clsx for merging
  return clsx(...validatedArgs);
}

/**
 * Type guard for MetricType with exhaustive checking
 * @param value - Value to check against MetricType enum
 * @returns boolean indicating if value is valid MetricType
 */
export function isMetricType(value: unknown): value is MetricType {
  if (typeof value !== 'string') return false;
  
  return Object.values(MetricType).includes(value as MetricType);
}

/**
 * Type guard for CampaignType with exhaustive checking
 * @param value - Value to check against CampaignType enum
 * @returns boolean indicating if value is valid CampaignType
 */
export function isCampaignType(value: unknown): value is CampaignType {
  if (typeof value !== 'string') return false;
  
  return Object.values(CampaignType).includes(value as CampaignType);
}

/**
 * Type guard for checking if a value is a valid object
 * @param value - Value to check
 * @returns boolean indicating if value is a non-null object
 */
export function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Safely access nested object properties with type checking
 * @param obj - Object to access
 * @param path - Path to property as string array
 * @param defaultValue - Default value if path doesn't exist
 * @returns Value at path or default value
 */
export function getNestedValue<T = unknown>(
  obj: Record<string, unknown>,
  path: string[],
  defaultValue: T
): T {
  try {
    return path.reduce((current: any, key) => {
      return current && current[key] !== undefined ? current[key] : defaultValue;
    }, obj) as T;
  } catch {
    return defaultValue;
  }
}