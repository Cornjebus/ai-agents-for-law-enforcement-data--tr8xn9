import { describe, expect, test } from '@jest/globals';
import { 
  formatCurrency, 
  formatPercentage, 
  formatDate, 
  formatMetric, 
  formatStatus 
} from '../../src/utils/format';
import { MetricType } from '../../src/types/analytics';
import { CampaignStatus } from '../../src/types/campaign';
import { LeadStatus } from '../../src/types/lead';

// Test constants
const TEST_DATE = new Date('2023-07-01T00:00:00.000Z');
const TEST_RELATIVE_DATE = new Date(Date.now() - 172800000); // 2 days ago
const TEST_CURRENCY_VALUE = 124500.00;
const TEST_PERCENTAGE_VALUE = 0.2345;
const TEST_ROAS_VALUE = 3.2;

describe('formatCurrency', () => {
  test('should format currency in US locale', () => {
    expect(formatCurrency(TEST_CURRENCY_VALUE)).toBe('$124,500');
    expect(formatCurrency(1000000)).toBe('$1,000,000');
  });

  test('should format currency in different locales', () => {
    expect(formatCurrency(TEST_CURRENCY_VALUE, 'en-GB', 'GBP')).toBe('£124,500');
    expect(formatCurrency(TEST_CURRENCY_VALUE, 'de-DE', 'EUR')).toBe('124.500 €');
  });

  test('should format currency in RTL for Arabic locale', () => {
    expect(formatCurrency(TEST_CURRENCY_VALUE, 'ar-SA', 'SAR')).toMatch(/SAR.*124,500/);
  });

  test('should handle negative values with proper minus sign', () => {
    expect(formatCurrency(-TEST_CURRENCY_VALUE)).toBe('-$124,500');
  });

  test('should format zero values consistently', () => {
    expect(formatCurrency(0)).toBe('$0');
  });

  test('should handle large values with proper grouping', () => {
    expect(formatCurrency(1234567.89)).toBe('$1,234,568');
  });

  test('should provide accessible currency output', () => {
    const formatted = formatCurrency(TEST_CURRENCY_VALUE);
    expect(formatted).toMatch(/\$[0-9,]+/);
    // Verify screen reader friendly format
    expect(formatted.replace(/[^0-9.-]/g, '')).toBe('124500');
  });

  test('should handle invalid inputs', () => {
    expect(() => formatCurrency(NaN)).toThrow(TypeError);
    expect(() => formatCurrency('invalid' as any)).toThrow(TypeError);
  });
});

describe('formatPercentage', () => {
  test('should format percentage with default precision', () => {
    expect(formatPercentage(TEST_PERCENTAGE_VALUE)).toBe('23.45%');
  });

  test('should format ROAS value', () => {
    expect(formatMetric(TEST_ROAS_VALUE, MetricType.ROAS)).toBe('3.20x');
  });

  test('should format MoM change', () => {
    expect(formatPercentage(0.15)).toBe('15.00%');
    expect(formatPercentage(-0.15)).toBe('-15.00%');
  });

  test('should handle custom precision', () => {
    expect(formatPercentage(TEST_PERCENTAGE_VALUE, 1)).toBe('23.4%');
    expect(formatPercentage(TEST_PERCENTAGE_VALUE, 3)).toBe('23.450%');
  });

  test('should format zero percentage', () => {
    expect(formatPercentage(0)).toBe('0.00%');
  });

  test('should provide accessible percentage output', () => {
    const formatted = formatPercentage(TEST_PERCENTAGE_VALUE);
    expect(formatted).toMatch(/[0-9.]+%/);
    // Verify screen reader friendly format
    expect(formatted.replace(/[^0-9.-]/g, '')).toBe('23.45');
  });

  test('should handle invalid inputs', () => {
    expect(() => formatPercentage(NaN)).toThrow(TypeError);
    expect(() => formatPercentage('invalid' as any)).toThrow(TypeError);
  });
});

describe('formatDate', () => {
  test('should format absolute dates', () => {
    expect(formatDate(TEST_DATE)).toBe('Jul 01, 2023');
  });

  test('should format relative time', () => {
    expect(formatDate(TEST_RELATIVE_DATE, undefined, { relative: true }))
      .toMatch(/2 days ago/i);
  });

  test('should format future dates', () => {
    const futureDate = new Date(Date.now() + 86400000); // tomorrow
    expect(formatDate(futureDate, undefined, { relative: true }))
      .toMatch(/in 1 day/i);
  });

  test('should handle different locale formats', () => {
    const date = new Date('2023-07-01');
    expect(formatDate(date, 'dd/MM/yyyy')).toBe('01/07/2023');
  });

  test('should handle invalid dates', () => {
    expect(() => formatDate(new Date('invalid'))).toThrow(TypeError);
    expect(() => formatDate('invalid' as any)).toThrow(TypeError);
  });

  test('should provide accessible date output', () => {
    const formatted = formatDate(TEST_DATE);
    expect(formatted).toMatch(/[A-Za-z]+ [0-9]{2}, [0-9]{4}/);
  });
});

describe('formatMetric', () => {
  test('should format revenue metric', () => {
    expect(formatMetric(TEST_CURRENCY_VALUE, MetricType.REVENUE))
      .toBe('$124,500');
  });

  test('should format conversion rate', () => {
    expect(formatMetric(TEST_PERCENTAGE_VALUE, MetricType.CONVERSION_RATE))
      .toBe('23.45%');
  });

  test('should format ROAS metric', () => {
    expect(formatMetric(TEST_ROAS_VALUE, MetricType.ROAS))
      .toBe('3.20x');
  });

  test('should handle different metric types', () => {
    expect(formatMetric(42, MetricType.CALL_VOLUME))
      .toBe('42.00');
  });

  test('should provide accessible metric output', () => {
    const formatted = formatMetric(TEST_CURRENCY_VALUE, MetricType.REVENUE);
    expect(formatted).toMatch(/\$[0-9,]+/);
  });

  test('should handle invalid inputs', () => {
    expect(() => formatMetric(NaN, MetricType.REVENUE)).toThrow(TypeError);
    expect(() => formatMetric('invalid' as any, MetricType.REVENUE)).toThrow(TypeError);
  });
});

describe('formatStatus', () => {
  test('should format campaign status with proper styling', () => {
    const { text, color } = formatStatus(CampaignStatus.ACTIVE, { colorCoded: true });
    expect(text).toBe('Active');
    expect(color).toBe('#059669');
  });

  test('should format lead status with proper styling', () => {
    const { text, color } = formatStatus(LeadStatus.NEW, { colorCoded: true });
    expect(text).toBe('New');
    expect(color).toBe('#3B82F6');
  });

  test('should handle status without color coding', () => {
    const { text, color } = formatStatus(CampaignStatus.ACTIVE);
    expect(text).toBe('Active');
    expect(color).toBeUndefined();
  });

  test('should format multi-word status', () => {
    const { text } = formatStatus('NEEDS_REVIEW' as CampaignStatus);
    expect(text).toBe('Needs Review');
  });

  test('should provide accessible status output', () => {
    const { text } = formatStatus(CampaignStatus.ACTIVE);
    expect(text).toMatch(/^[A-Z][a-z]+$/);
  });

  test('should handle invalid status', () => {
    const { text } = formatStatus('INVALID_STATUS' as CampaignStatus);
    expect(text).toBe('Invalid Status');
  });
});