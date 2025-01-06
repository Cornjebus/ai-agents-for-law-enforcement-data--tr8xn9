/**
 * @fileoverview Comprehensive test suite for validation utility functions
 * @version 1.0.0
 */

import { describe, it, expect } from 'jest';
import {
  validateEmail,
  validatePhoneNumber,
  validateUrl,
  ValidationError,
  ValidationSeverity,
  campaignSchema,
  contentSchema,
  leadSchema
} from '../../src/utils/validation';

// Test data constants
const VALID_EMAILS = [
  'test@example.com',
  'user.name@domain.co.uk',
  'test+label@domain.com',
  'business@verified-domain.com'
];

const INVALID_EMAILS = [
  'test@disposable.com',
  'user@malicious-domain.com',
  'test@low-reputation.com',
  'invalid-email',
  '',
  'test@.com',
  '@domain.com'
];

const VALID_PHONES = [
  '+1234567890',
  '+44 1234567890',
  '+81 0901234567',
  '+61 412345678'
];

const INVALID_PHONES = [
  '123',
  '+invalid',
  '+1234',
  '+00 invalid-carrier',
  '',
  'abc123'
];

const VALID_URLS = [
  'https://example.com',
  'https://secure-domain.com/path',
  'https://verified-business.com?param=value'
];

const INVALID_URLS = [
  'http://malicious-site.com',
  'ftp://insecure.com',
  'https://blacklisted-domain.com',
  'invalid-url',
  '',
  'http://'
];

describe('Email Validation', () => {
  describe('validateEmail - Valid Cases', () => {
    it.each(VALID_EMAILS)('should validate correct email: %s', async (email) => {
      const result = await validateEmail(email, true);
      expect(result.isValid).toBe(true);
      expect(result.severity).toBe(ValidationSeverity.INFO);
      expect(result.message).toBe('Email is valid');
    });

    it('should validate business domain with high reputation', async () => {
      const result = await validateEmail('user@microsoft.com', true);
      expect(result.isValid).toBe(true);
      expect(result.severity).toBe(ValidationSeverity.INFO);
    });

    it('should cache validation results for performance', async () => {
      const email = 'test@example.com';
      const firstResult = await validateEmail(email);
      const secondResult = await validateEmail(email);
      expect(firstResult).toEqual(secondResult);
    });
  });

  describe('validateEmail - Invalid Cases', () => {
    it.each(INVALID_EMAILS)('should reject invalid email: %s', async (email) => {
      const result = await validateEmail(email, true);
      expect(result.isValid).toBe(false);
      expect(result.severity).toBeGreaterThanOrEqual(ValidationSeverity.ERROR);
    });

    it('should detect disposable email domains', async () => {
      const result = await validateEmail('user@tempmail.com', true);
      expect(result.isValid).toBe(false);
      expect(result.securityInfo?.threatLevel).toBeGreaterThan(0);
      expect(result.securityInfo?.securityFlags).toContain('disposable_domain');
    });

    it('should provide helpful suggestions for invalid format', async () => {
      const result = await validateEmail('invalid@.com');
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions?.length).toBeGreaterThan(0);
    });
  });
});

describe('Phone Number Validation', () => {
  describe('validatePhoneNumber - Valid Cases', () => {
    it.each(VALID_PHONES)('should validate correct phone number: %s', (phone) => {
      const result = validatePhoneNumber(phone);
      expect(result.isValid).toBe(true);
      expect(result.severity).toBe(ValidationSeverity.INFO);
    });

    it('should validate phone number with country code', () => {
      const result = validatePhoneNumber('+1-555-123-4567', 'US');
      expect(result.isValid).toBe(true);
    });

    it('should handle various formatting styles', () => {
      const formats = [
        '+1 (555) 123-4567',
        '+1.555.123.4567',
        '+1 555 123 4567'
      ];
      formats.forEach(phone => {
        expect(validatePhoneNumber(phone).isValid).toBe(true);
      });
    });
  });

  describe('validatePhoneNumber - Invalid Cases', () => {
    it.each(INVALID_PHONES)('should reject invalid phone number: %s', (phone) => {
      const result = validatePhoneNumber(phone);
      expect(result.isValid).toBe(false);
      expect(result.severity).toBe(ValidationSeverity.ERROR);
    });

    it('should provide formatting suggestions', () => {
      const result = validatePhoneNumber('12345');
      expect(result.suggestions).toBeDefined();
      expect(result.suggestions).toContain('Include country code (e.g., +1)');
    });

    it('should validate against specific country format', () => {
      const result = validatePhoneNumber('123-456-7890', 'US');
      expect(result.isValid).toBe(false);
      expect(result.suggestions).toContain('Example: +1-555-123-4567');
    });
  });
});

describe('URL Validation', () => {
  describe('validateUrl - Valid Cases', () => {
    it.each(VALID_URLS)('should validate correct URL: %s', async (url) => {
      const result = await validateUrl(url, true);
      expect(result.isValid).toBe(true);
      expect(result.severity).toBe(ValidationSeverity.INFO);
    });

    it('should validate secure business domains', async () => {
      const result = await validateUrl('https://enterprise.com/secure');
      expect(result.isValid).toBe(true);
    });

    it('should accept URLs with query parameters', async () => {
      const result = await validateUrl('https://example.com/path?param=value');
      expect(result.isValid).toBe(true);
    });
  });

  describe('validateUrl - Invalid Cases', () => {
    it.each(INVALID_URLS)('should reject invalid URL: %s', async (url) => {
      const result = await validateUrl(url, true);
      expect(result.isValid).toBe(false);
    });

    it('should reject non-HTTPS URLs', async () => {
      const result = await validateUrl('http://example.com');
      expect(result.isValid).toBe(false);
      expect(result.securityInfo?.securityFlags).toContain('insecure_protocol');
    });

    it('should detect potentially malicious URLs', async () => {
      const result = await validateUrl('https://known-malicious.com', true);
      expect(result.securityInfo?.threatLevel).toBeGreaterThan(0);
    });
  });
});

describe('ValidationError Class', () => {
  it('should create error with all properties', () => {
    const error = new ValidationError(
      'Invalid email',
      'email',
      'test@invalid',
      ValidationSeverity.ERROR,
      ['Use a valid email format'],
      {
        threatLevel: 0.5,
        maliciousScore: 0.3,
        securityFlags: ['format_invalid'],
        recommendations: ['Check email format']
      }
    );

    expect(error.message).toBe('Invalid email');
    expect(error.field).toBe('email');
    expect(error.value).toBe('test@invalid');
    expect(error.severity).toBe(ValidationSeverity.ERROR);
    expect(error.suggestions).toContain('Use a valid email format');
    expect(error.securityInfo?.threatLevel).toBe(0.5);
  });

  it('should handle minimal constructor parameters', () => {
    const error = new ValidationError('Invalid input', 'field', 'value');
    expect(error.severity).toBe(ValidationSeverity.ERROR);
    expect(error.suggestions).toEqual([]);
    expect(error.securityInfo).toBeUndefined();
  });
});

describe('Schema Validation', () => {
  describe('Campaign Schema', () => {
    it('should validate valid campaign data', () => {
      const validCampaign = {
        name: 'Test Campaign',
        type: 'OUTBOUND_CALL',
        budget: {
          daily: 100,
          total: 1000
        },
        aiConfig: {
          model: 'gpt-4',
          temperature: 0.7,
          maxTokens: 1000
        }
      };
      expect(() => campaignSchema.parse(validCampaign)).not.toThrow();
    });

    it('should reject invalid campaign data', () => {
      const invalidCampaign = {
        name: 'T', // Too short
        type: 'INVALID_TYPE',
        budget: {
          daily: -100, // Negative value
          total: 0 // Zero value
        }
      };
      expect(() => campaignSchema.parse(invalidCampaign)).toThrow();
    });
  });

  describe('Content Schema', () => {
    it('should validate valid content data', () => {
      const validContent = {
        title: 'Valid Content Title',
        content: 'Valid content body with sufficient length',
        platform: 'LINKEDIN',
        metadata: {
          language: 'en',
          targetAudience: ['professionals'],
          aiModel: 'gpt-4'
        }
      };
      expect(() => contentSchema.parse(validContent)).not.toThrow();
    });

    it('should reject invalid content data', () => {
      const invalidContent = {
        title: 'Hi', // Too short
        content: '', // Empty
        platform: 'INVALID',
        metadata: {
          language: '',
          targetAudience: [],
          aiModel: ''
        }
      };
      expect(() => contentSchema.parse(invalidContent)).toThrow();
    });
  });
});