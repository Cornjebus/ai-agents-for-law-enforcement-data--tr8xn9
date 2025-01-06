import { describe, it, expect, jest } from '@jest/globals';
import { TimeRange } from '../../src/types/analytics';
import { 
  formatDate, 
  parseDate, 
  getDateRangeFromTimeRange,
  DATE_FORMAT,
  DATETIME_FORMAT,
  DISPLAY_DATE_FORMAT,
  DISPLAY_DATETIME_FORMAT
} from '../../src/utils/date';

// Test constants
const TEST_DATE = new Date('2023-01-01T00:00:00.000Z');
const TEST_DATE_STRING = '2023-01-01T00:00:00.000Z';
const TEST_CUSTOM_FORMAT = 'MM/dd/yyyy';
const TEST_LOCALES = ['en-US', 'es-ES', 'ja-JP'];
const TEST_TIMEZONES = ['UTC', 'America/New_York', 'Asia/Tokyo'];
const PERFORMANCE_THRESHOLD_MS = 100;

describe('formatDate', () => {
  it('should format valid date with default format', () => {
    const formatted = formatDate(TEST_DATE);
    expect(formatted).toBe('Jan 1, 2023');
  });

  it('should format valid date with custom format', () => {
    const formatted = formatDate(TEST_DATE, TEST_CUSTOM_FORMAT);
    expect(formatted).toBe('01/01/2023');
  });

  it('should handle different locales correctly', () => {
    const enFormatted = formatDate(TEST_DATE, DISPLAY_DATE_FORMAT, 'en-US');
    const esFormatted = formatDate(TEST_DATE, DISPLAY_DATE_FORMAT, 'es-ES');
    expect(enFormatted).toBe('Jan 1, 2023');
    expect(esFormatted).toBe('1 ene 2023');
  });

  it('should handle invalid date input', () => {
    const formatted = formatDate(null);
    expect(formatted).toBe('');
  });

  it('should handle undefined date input', () => {
    const formatted = formatDate(undefined);
    expect(formatted).toBe('');
  });

  it('should handle invalid format string', () => {
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
    const formatted = formatDate(TEST_DATE, 'invalid-format');
    expect(formatted).toBe('Jan 1, 2023');
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('should meet performance threshold for multiple format operations', () => {
    const startTime = performance.now();
    for (let i = 0; i < 1000; i++) {
      formatDate(TEST_DATE);
    }
    const endTime = performance.now();
    expect(endTime - startTime).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
  });
});

describe('parseDate', () => {
  it('should parse valid date string with default format', () => {
    const parsed = parseDate('2023-01-01');
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.toISOString().startsWith('2023-01-01')).toBe(true);
  });

  it('should parse valid datetime string', () => {
    const parsed = parseDate('2023-01-01 12:00:00', DATETIME_FORMAT);
    expect(parsed).toBeInstanceOf(Date);
    expect(parsed?.getHours()).toBe(12);
  });

  it('should handle null input', () => {
    const parsed = parseDate('');
    expect(parsed).toBeNull();
  });

  it('should handle invalid date string', () => {
    const parsed = parseDate('invalid-date');
    expect(parsed).toBeNull();
  });

  it('should handle invalid format string', () => {
    expect(() => parseDate('2023-01-01', 'invalid-format')).toThrow();
  });

  it('should handle timezone offsets correctly', () => {
    const dateString = '2023-01-01 00:00:00';
    const parsed = parseDate(dateString, DATETIME_FORMAT);
    expect(parsed?.getTimezoneOffset()).toBeDefined();
  });

  it('should meet performance threshold for multiple parse operations', () => {
    const startTime = performance.now();
    for (let i = 0; i < 1000; i++) {
      parseDate('2023-01-01');
    }
    const endTime = performance.now();
    expect(endTime - startTime).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
  });
});

describe('getDateRangeFromTimeRange', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(TEST_DATE);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should handle TODAY time range correctly', () => {
    const { startDate, endDate } = getDateRangeFromTimeRange(TimeRange.TODAY);
    expect(startDate.getHours()).toBe(0);
    expect(startDate.getMinutes()).toBe(0);
    expect(endDate.getDate()).toBe(startDate.getDate());
  });

  it('should handle LAST_7_DAYS time range correctly', () => {
    const { startDate, endDate } = getDateRangeFromTimeRange(TimeRange.LAST_7_DAYS);
    const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(7);
  });

  it('should handle LAST_30_DAYS time range correctly', () => {
    const { startDate, endDate } = getDateRangeFromTimeRange(TimeRange.LAST_30_DAYS);
    const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(30);
  });

  it('should handle LAST_90_DAYS time range correctly', () => {
    const { startDate, endDate } = getDateRangeFromTimeRange(TimeRange.LAST_90_DAYS);
    const diffDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(90);
  });

  it('should handle REAL_TIME time range correctly', () => {
    const { startDate, endDate } = getDateRangeFromTimeRange(TimeRange.REAL_TIME);
    const diffHours = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60));
    expect(diffHours).toBe(24);
  });

  it('should use cache when enabled', () => {
    const firstCall = getDateRangeFromTimeRange(TimeRange.TODAY);
    const secondCall = getDateRangeFromTimeRange(TimeRange.TODAY);
    expect(firstCall).toEqual(secondCall);
  });

  it('should bypass cache when disabled', () => {
    const firstCall = getDateRangeFromTimeRange(TimeRange.TODAY, true);
    jest.advanceTimersByTime(1000);
    const secondCall = getDateRangeFromTimeRange(TimeRange.TODAY, false);
    expect(firstCall.endDate.getTime()).not.toBe(secondCall.endDate.getTime());
  });

  it('should meet performance threshold for multiple range calculations', () => {
    const startTime = performance.now();
    for (let i = 0; i < 1000; i++) {
      getDateRangeFromTimeRange(TimeRange.LAST_30_DAYS);
    }
    const endTime = performance.now();
    expect(endTime - startTime).toBeLessThan(PERFORMANCE_THRESHOLD_MS);
  });

  it('should handle cache invalidation after duration', () => {
    const firstCall = getDateRangeFromTimeRange(TimeRange.TODAY);
    jest.advanceTimersByTime(300001); // Just over 5 minutes
    const secondCall = getDateRangeFromTimeRange(TimeRange.TODAY);
    expect(firstCall.endDate.getTime()).not.toBe(secondCall.endDate.getTime());
  });
});