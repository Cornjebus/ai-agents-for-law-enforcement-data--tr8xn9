import { format, formatDistance } from 'date-fns';
import { MetricType } from '../types/analytics';
import { CampaignStatus } from '../types/campaign';
import { LeadStatus } from '../types/lead';

// Constants for default formatting options
const DEFAULT_LOCALE = 'en-US';
const DEFAULT_CURRENCY = 'USD';
const DEFAULT_DATE_FORMAT = 'MMM dd, yyyy';
const DEFAULT_PRECISION = 2;

// Status color mapping for visual indicators
const STATUS_COLORS = {
  // Campaign status colors
  [CampaignStatus.ACTIVE]: '#059669',
  [CampaignStatus.PAUSED]: '#DC2626',
  // Lead status colors
  [LeadStatus.NEW]: '#3B82F6',
  [LeadStatus.COLD]: '#6B7280',
  [LeadStatus.ACTIVE]: '#059669'
};

/**
 * Formats a number as currency with locale support
 * @param value - Numeric value to format
 * @param locale - Locale string (default: en-US)
 * @param currency - Currency code (default: USD)
 * @param options - Additional formatting options
 * @returns Formatted currency string
 * @throws {TypeError} If value is not a valid number
 */
export const formatCurrency = (
  value: number,
  locale: string = DEFAULT_LOCALE,
  currency: string = DEFAULT_CURRENCY,
  options: Intl.NumberFormatOptions = {}
): string => {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new TypeError('Invalid numeric value provided to formatCurrency');
  }

  try {
    const formatter = new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
      ...options
    });

    return formatter.format(value);
  } catch (error) {
    console.error('Currency formatting error:', error);
    return `${currency} ${value.toFixed(2)}`;
  }
};

/**
 * Formats a decimal as a percentage with configurable precision
 * @param value - Decimal value to format (0.23 = 23%)
 * @param precision - Number of decimal places (default: 2)
 * @param options - Additional formatting options
 * @returns Formatted percentage string
 * @throws {TypeError} If value is not a valid number
 */
export const formatPercentage = (
  value: number,
  precision: number = DEFAULT_PRECISION,
  options: Intl.NumberFormatOptions = {}
): string => {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new TypeError('Invalid numeric value provided to formatPercentage');
  }

  try {
    const formatter = new Intl.NumberFormat(DEFAULT_LOCALE, {
      style: 'percent',
      minimumFractionDigits: precision,
      maximumFractionDigits: precision,
      ...options
    });

    return formatter.format(value);
  } catch (error) {
    console.error('Percentage formatting error:', error);
    return `${(value * 100).toFixed(precision)}%`;
  }
};

/**
 * Formats a date with support for relative time
 * @param date - Date to format
 * @param formatString - Date format string (default: MMM dd, yyyy)
 * @param options - Additional formatting options
 * @returns Formatted date string
 * @throws {TypeError} If date is invalid
 */
export const formatDate = (
  date: Date,
  formatString: string = DEFAULT_DATE_FORMAT,
  options: { relative?: boolean } = {}
): string => {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    throw new TypeError('Invalid date provided to formatDate');
  }

  try {
    if (options.relative) {
      return formatDistance(date, new Date(), { addSuffix: true });
    }
    return format(date, formatString);
  } catch (error) {
    console.error('Date formatting error:', error);
    return date.toLocaleDateString();
  }
};

/**
 * Formats metric values based on type with comprehensive error handling
 * @param value - Numeric value to format
 * @param type - MetricType enum value
 * @param options - Additional formatting options
 * @returns Formatted metric string
 * @throws {TypeError} If value is not a valid number
 */
export const formatMetric = (
  value: number,
  type: MetricType,
  options: {
    precision?: number;
    locale?: string;
    currency?: string;
  } = {}
): string => {
  if (typeof value !== 'number' || isNaN(value)) {
    throw new TypeError('Invalid numeric value provided to formatMetric');
  }

  const { precision = DEFAULT_PRECISION, locale = DEFAULT_LOCALE, currency = DEFAULT_CURRENCY } = options;

  try {
    switch (type) {
      case MetricType.REVENUE:
        return formatCurrency(value, locale, currency);
      
      case MetricType.CONVERSION_RATE:
        return formatPercentage(value, precision);
      
      case MetricType.ROAS:
        return `${value.toFixed(precision)}x`;
      
      default:
        return value.toLocaleString(locale, {
          minimumFractionDigits: precision,
          maximumFractionDigits: precision
        });
    }
  } catch (error) {
    console.error('Metric formatting error:', error);
    return value.toString();
  }
};

/**
 * Formats status enums with consistent styling and color coding
 * @param status - Status enum value (Campaign or Lead)
 * @param options - Additional formatting options
 * @returns Formatted status object with text and color
 */
export const formatStatus = (
  status: CampaignStatus | LeadStatus,
  options: { colorCoded?: boolean } = {}
): { text: string; color?: string } => {
  try {
    const text = status.toLowerCase()
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');

    return {
      text,
      ...(options.colorCoded && STATUS_COLORS[status] && {
        color: STATUS_COLORS[status]
      })
    };
  } catch (error) {
    console.error('Status formatting error:', error);
    return { text: status.toString() };
  }
};