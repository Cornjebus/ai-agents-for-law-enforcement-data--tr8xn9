/**
 * Enum defining available metric types for analytics including performance metrics
 * @version 1.0.0
 */
export enum MetricType {
  REVENUE = 'REVENUE',
  CONVERSION_RATE = 'CONVERSION_RATE',
  CALL_VOLUME = 'CALL_VOLUME',
  LEAD_QUALITY = 'LEAD_QUALITY',
  CAMPAIGN_PERFORMANCE = 'CAMPAIGN_PERFORMANCE',
  AI_EFFICIENCY = 'AI_EFFICIENCY',
  API_LATENCY = 'API_LATENCY',
  VOICE_PROCESSING_TIME = 'VOICE_PROCESSING_TIME'
}

/**
 * Enum defining time range options for analytics filtering including real-time
 * @version 1.0.0
 */
export enum TimeRange {
  TODAY = 'TODAY',
  LAST_7_DAYS = 'LAST_7_DAYS',
  LAST_30_DAYS = 'LAST_30_DAYS',
  LAST_90_DAYS = 'LAST_90_DAYS',
  CUSTOM = 'CUSTOM',
  REAL_TIME = 'REAL_TIME'
}

/**
 * Interface for individual analytics metric data structure with performance monitoring
 * @interface IAnalyticsMetric
 */
export interface IAnalyticsMetric {
  id: string;
  type: MetricType;
  value: number;
  previousValue: number;
  changePercentage: number;
  timestamp: Date;
  threshold: number;
  status: 'normal' | 'warning' | 'critical';
}

/**
 * Interface for chart visualization data structure with threshold support
 * @interface IChartData
 */
export interface IChartData {
  labels: string[];
  datasets: Array<{
    label: string;
    data: number[];
    color: string;
    borderDash?: number[];
  }>;
  type: MetricType;
  thresholds: Array<{
    value: number;
    label: string;
    color: string;
  }>;
}

/**
 * Interface for analytics filtering options with real-time refresh support
 * @interface IAnalyticsFilter
 */
export interface IAnalyticsFilter {
  timeRange: TimeRange;
  startDate: Date | null;
  endDate: Date | null;
  metricTypes: MetricType[];
  campaignId: string | null;
  refreshInterval: number;
}

/**
 * Interface for complete analytics dashboard data structure with performance metrics
 * @interface IAnalyticsDashboard
 */
export interface IAnalyticsDashboard {
  metrics: IAnalyticsMetric[];
  charts: Record<MetricType, IChartData>;
  summary: {
    totalRevenue: number;
    conversionRate: number;
    activeLeads: number;
    aiEfficiency: number;
    systemHealth: {
      status: string;
      issues: string[];
    };
  };
  performance: {
    apiLatency: number;
    voiceProcessingTime: number;
    errorRate: number;
  };
}