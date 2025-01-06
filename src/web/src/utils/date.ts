import { format, parse, addDays, subDays, isValid } from 'date-fns';
import { TimeRange } from '../types/analytics';

/**
 * Constants for date formatting and caching
 * @version 1.0.0
 */
export const DATE_FORMAT = 'yyyy-MM-dd';
export const DATETIME_FORMAT = 'yyyy-MM-dd HH:mm:ss';
export const DISPLAY_DATE_FORMAT = 'MMM d, yyyy';
export const DISPLAY_DATETIME_FORMAT = 'MMM d, yyyy HH:mm';
export const CACHE_DURATION = 300000; // 5 minutes in milliseconds
export const DEFAULT_LOCALE = 'en-US';
export const MAX_DATE_RANGE = 365;

// Cache for date range calculations
const dateRangeCache = new Map<TimeRange, { startDate: Date; endDate: Date; timestamp: number }>();

/**
 * Type-safe date formatting with error handling and locale support
 * @param date - Date to format
 * @param formatString - Format pattern to use
 * @param locale - Optional locale (defaults to en-US)
 * @returns Formatted date string or empty string if invalid
 */
export const formatDate = (
  date: Date | null | undefined,
  formatString: string = DISPLAY_DATE_FORMAT,
  locale: Locale | string = DEFAULT_LOCALE
): string => {
  try {
    if (!date || !isValid(date)) {
      return '';
    }

    // Validate format string against allowed formats
    const allowedFormats = [DATE_FORMAT, DATETIME_FORMAT, DISPLAY_DATE_FORMAT, DISPLAY_DATETIME_FORMAT];
    if (!allowedFormats.includes(formatString)) {
      console.warn(`Invalid format string: ${formatString}. Using default format.`);
      formatString = DISPLAY_DATE_FORMAT;
    }

    return format(date, formatString, { locale });
  } catch (error) {
    console.error('Error formatting date:', error);
    return '';
  }
};

/**
 * Parse date string with strict validation and timezone handling
 * @param dateString - String to parse into Date
 * @param formatString - Expected format of the date string
 * @param strict - Whether to use strict parsing (defaults to true)
 * @returns Parsed Date object or null if invalid
 */
export const parseDate = (
  dateString: string,
  formatString: string = DATE_FORMAT,
  strict: boolean = true
): Date | null => {
  try {
    if (!dateString) {
      return null;
    }

    // Validate format string
    const allowedFormats = [DATE_FORMAT, DATETIME_FORMAT];
    if (!allowedFormats.includes(formatString)) {
      throw new Error(`Invalid format string: ${formatString}`);
    }

    // Parse date with strict validation
    const parsedDate = parse(dateString, formatString, new Date());
    
    if (!isValid(parsedDate)) {
      return null;
    }

    // Handle timezone conversion if needed
    const timezoneOffset = parsedDate.getTimezoneOffset();
    if (timezoneOffset !== 0) {
      parsedDate.setMinutes(parsedDate.getMinutes() + timezoneOffset);
    }

    return parsedDate;
  } catch (error) {
    console.error('Error parsing date:', error);
    return null;
  }
};

/**
 * Calculate date range from TimeRange enum with caching and optimization
 * @param timeRange - TimeRange enum value
 * @param useCache - Whether to use cached results (defaults to true)
 * @returns Object containing start and end dates
 */
export const getDateRangeFromTimeRange = (
  timeRange: TimeRange,
  useCache: boolean = true
): { startDate: Date; endDate: Date } => {
  // Check cache first if enabled
  if (useCache) {
    const cached = dateRangeCache.get(timeRange);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return {
        startDate: cached.startDate,
        endDate: cached.endDate
      };
    }
  }

  const endDate = new Date();
  let startDate: Date;

  // Calculate start date based on time range
  switch (timeRange) {
    case TimeRange.TODAY:
      startDate = new Date(endDate);
      startDate.setHours(0, 0, 0, 0);
      break;

    case TimeRange.LAST_7_DAYS:
      startDate = subDays(endDate, 7);
      break;

    case TimeRange.LAST_30_DAYS:
      startDate = subDays(endDate, 30);
      break;

    case TimeRange.LAST_90_DAYS:
      startDate = subDays(endDate, 90);
      break;

    case TimeRange.REAL_TIME:
      startDate = subDays(endDate, 1); // Last 24 hours for real-time
      break;

    default:
      startDate = subDays(endDate, 30); // Default to last 30 days
  }

  const result = { startDate, endDate };

  // Cache the result if caching is enabled
  if (useCache) {
    dateRangeCache.set(timeRange, {
      ...result,
      timestamp: Date.now()
    });
  }

  return result;
};

/**
 * Validate date range is within allowed limits
 * @param startDate - Start date of range
 * @param endDate - End date of range
 * @returns boolean indicating if range is valid
 */
export const isValidDateRange = (startDate: Date, endDate: Date): boolean => {
  try {
    if (!isValid(startDate) || !isValid(endDate)) {
      return false;
    }

    // Ensure end date is not before start date
    if (endDate < startDate) {
      return false;
    }

    // Check if range is within maximum allowed days
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return diffDays <= MAX_DATE_RANGE;
  } catch (error) {
    console.error('Error validating date range:', error);
    return false;
  }
};