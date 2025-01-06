/**
 * Core TypeScript interfaces and types for the platform's metrics and analytics system.
 * Provides standardized structures for collecting, querying, and aggregating performance metrics
 * across the autonomous revenue generation platform.
 */

/**
 * Enumeration of all supported metric types in the system.
 * Covers both technical performance metrics and business metrics.
 */
export enum MetricType {
    LATENCY = 'LATENCY',                           // API and service response times
    THROUGHPUT = 'THROUGHPUT',                     // Request handling capacity
    ERROR_RATE = 'ERROR_RATE',                     // System error frequency
    CONCURRENT_USERS = 'CONCURRENT_USERS',         // Active user count
    UPTIME = 'UPTIME',                            // System availability
    QUERY_TIME = 'QUERY_TIME',                     // Database performance
    VOICE_LATENCY = 'VOICE_LATENCY',              // Voice processing delay
    CONTENT_GENERATION_TIME = 'CONTENT_GENERATION_TIME', // AI content creation time
    REVENUE = 'REVENUE',                          // Financial performance
    CONVERSION_RATE = 'CONVERSION_RATE'           // Business effectiveness
}

/**
 * Enumeration of supported measurement units for metrics.
 * Provides standardized units for different types of measurements.
 */
export enum MetricUnit {
    MILLISECONDS = 'ms',                          // Time measurements
    REQUESTS_PER_SECOND = 'req/s',                // Throughput measurements
    QUERIES_PER_SECOND = 'q/s',                   // Database performance
    PERCENTAGE = '%',                             // General percentages
    UPTIME_PERCENTAGE = 'uptime_%',               // System availability
    COUNT = 'count',                              // Absolute numbers
    DOLLARS = 'USD',                              // Monetary values
    WORDS_PER_MINUTE = 'w/m'                      // Content generation speed
}

/**
 * Core interface for metric data structure.
 * Provides comprehensive context and metadata for each metric measurement.
 */
export interface IMetric {
    id: string;                                   // Unique identifier
    name: string;                                 // Human-readable metric name
    type: MetricType;                            // Type of metric being measured
    value: number;                               // Actual metric value
    unit: MetricUnit;                            // Unit of measurement
    timestamp: Date;                             // When the metric was recorded
    service: string;                             // Service generating the metric
    environment: string;                         // Environment (prod/staging/dev)
    metadata: Record<string, any>;               // Additional contextual data
    tags: Record<string, string>;                // Searchable metric tags
}

/**
 * Interface for metric query parameters.
 * Enables flexible and powerful metric data retrieval.
 */
export interface IMetricQuery {
    startTime: Date;                             // Query period start
    endTime: Date;                               // Query period end
    types: MetricType[];                         // Metric types to query
    tags: Record<string, string>;                // Tag-based filtering
    groupBy: string[];                           // Grouping dimensions
    aggregationType: string;                     // Aggregation method
    filters: Record<string, any>;                // Additional query filters
    limit: number;                               // Result count limit
    offset: number;                              // Pagination offset
}

/**
 * Interface for metric aggregation results.
 * Provides statistical analysis of metric data.
 */
export interface IMetricAggregation {
    type: MetricType;                           // Type of metric aggregated
    average: number;                            // Mean value
    min: number;                                // Minimum value
    max: number;                                // Maximum value
    sum: number;                                // Total sum
    count: number;                              // Number of measurements
}