import React, { useEffect, useMemo, useCallback, useRef } from 'react';
import clsx from 'clsx';
import { Chart } from '../shared/Chart';
import { IChartData, MetricType, TimeRange } from '../../types/analytics';
import { useAnalytics } from '../../hooks/useAnalytics';
import { ANALYTICS_CONFIG, DESIGN_SYSTEM } from '../../lib/constants';

// Performance thresholds for different metrics
const PERFORMANCE_THRESHOLDS = {
  LOW: 30,
  MEDIUM: 60,
  HIGH: 90,
};

// Chart configuration constants
const CHART_DEFAULTS = {
  HEIGHT: 300,
  REFRESH_INTERVAL: 30000,
  COMPRESSION_RATIO: 0.5,
  SAMPLING_RATE: 0.8,
  DEBOUNCE_DELAY: 250,
  ERROR_RETRY_ATTEMPTS: 3,
  WEBSOCKET_TIMEOUT: 5000,
};

interface IDataPoint {
  label: string;
  value: number;
  timestamp: number;
}

interface PerformanceChartProps {
  /** CSS class name for custom styling */
  className?: string;
  /** Type of metric to display */
  metricType: MetricType;
  /** Time range for data display */
  timeRange: TimeRange;
  /** Chart height in pixels */
  height?: number;
  /** Show target line on chart */
  showTargetLine?: boolean;
  /** Target value for metric */
  targetValue?: number;
  /** Callback for data point click events */
  onDataPointClick?: (point: IDataPoint) => void;
  /** Refresh interval in milliseconds */
  refreshInterval?: number;
  /** Data compression ratio for optimization */
  compressionRatio?: number;
  /** Enable virtual scrolling for large datasets */
  virtualScrolling?: boolean;
  /** Data sampling rate for performance */
  samplingRate?: number;
  /** Accessibility label for screen readers */
  accessibilityLabel?: string;
  /** Fallback component for error states */
  errorFallback?: React.ReactNode;
}

/**
 * Enhanced performance chart component for analytics visualization
 * Implements real-time updates, data compression, and accessibility features
 */
export const PerformanceChart: React.FC<PerformanceChartProps> = ({
  className,
  metricType,
  timeRange,
  height = CHART_DEFAULTS.HEIGHT,
  showTargetLine = false,
  targetValue,
  onDataPointClick,
  refreshInterval = CHART_DEFAULTS.REFRESH_INTERVAL,
  compressionRatio = CHART_DEFAULTS.COMPRESSION_RATIO,
  virtualScrolling = false,
  samplingRate = CHART_DEFAULTS.SAMPLING_RATE,
  accessibilityLabel,
  errorFallback
}) => {
  // Refs for performance optimization
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const errorCountRef = useRef(0);
  const lastUpdateRef = useRef<number>(Date.now());

  // Analytics hook for data management
  const {
    charts,
    isLoading,
    error,
    fetchChartData,
    subscribeToUpdates,
    unsubscribeFromUpdates
  } = useAnalytics();

  /**
   * Format and optimize chart data with compression and sampling
   */
  const formattedData = useMemo(() => {
    if (!charts?.[metricType]) return null;

    const data = charts[metricType];
    let processedData = { ...data };

    // Apply data sampling for performance
    if (samplingRate < 1) {
      processedData.datasets = data.datasets.map(dataset => ({
        ...dataset,
        data: dataset.data.filter((_, index) => 
          index % Math.floor(1 / samplingRate) === 0
        )
      }));
    }

    // Apply compression for large datasets
    if (compressionRatio < 1) {
      const compressionStep = Math.floor(1 / compressionRatio);
      processedData.labels = data.labels.filter((_, index) => 
        index % compressionStep === 0
      );
      processedData.datasets = data.datasets.map(dataset => ({
        ...dataset,
        data: dataset.data.filter((_, index) => 
          index % compressionStep === 0
        )
      }));
    }

    return processedData;
  }, [charts, metricType, samplingRate, compressionRatio]);

  /**
   * Handle real-time data updates via WebSocket
   */
  const handleWebSocketUpdate = useCallback((update: any) => {
    const now = Date.now();
    if (now - lastUpdateRef.current < CHART_DEFAULTS.DEBOUNCE_DELAY) return;

    try {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }

      updateTimeoutRef.current = setTimeout(() => {
        fetchChartData(metricType, { timeRange });
        lastUpdateRef.current = now;
      }, CHART_DEFAULTS.DEBOUNCE_DELAY);
    } catch (error) {
      console.error('WebSocket update error:', error);
      errorCountRef.current++;

      if (errorCountRef.current > CHART_DEFAULTS.ERROR_RETRY_ATTEMPTS) {
        window.dispatchEvent(new CustomEvent('chart-error', {
          detail: {
            type: 'websocket_error',
            metric: metricType,
            error: error.message
          }
        }));
      }
    }
  }, [metricType, timeRange, fetchChartData]);

  /**
   * Initialize chart data and WebSocket subscription
   */
  useEffect(() => {
    const initChart = async () => {
      try {
        await fetchChartData(metricType, { timeRange });
        const unsubscribe = subscribeToUpdates(handleWebSocketUpdate);

        return () => {
          unsubscribe();
          if (updateTimeoutRef.current) {
            clearTimeout(updateTimeoutRef.current);
          }
        };
      } catch (error) {
        console.error('Chart initialization error:', error);
        window.dispatchEvent(new CustomEvent('chart-error', {
          detail: {
            type: 'initialization_error',
            metric: metricType,
            error: error.message
          }
        }));
      }
    };

    initChart();
  }, [metricType, timeRange, fetchChartData, subscribeToUpdates, handleWebSocketUpdate]);

  /**
   * Handle data point click events
   */
  const handleDataPointClick = useCallback((point: any) => {
    if (!onDataPointClick) return;

    const dataPoint: IDataPoint = {
      label: point.label,
      value: point.value,
      timestamp: Date.now()
    };

    onDataPointClick(dataPoint);
  }, [onDataPointClick]);

  // Error handling and fallback
  if (error && errorFallback) {
    return <>{errorFallback}</>;
  }

  return (
    <div 
      className={clsx(
        'performance-chart',
        'relative',
        'rounded-lg',
        'border',
        'border-gray-200',
        'bg-white',
        'p-4',
        className
      )}
      role="region"
      aria-label={accessibilityLabel || `${metricType} Performance Chart`}
    >
      {isLoading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-75">
          <div className="loading-spinner" role="status" aria-label="Loading chart data" />
        </div>
      )}

      {formattedData && (
        <Chart
          data={formattedData}
          type="line"
          height={height}
          showLegend
          showGrid
          showTooltip
          showTargetLine={showTargetLine}
          targetValue={targetValue}
          thresholds={{
            warning: PERFORMANCE_THRESHOLDS.MEDIUM,
            critical: PERFORMANCE_THRESHOLDS.HIGH
          }}
          onDataPointClick={handleDataPointClick}
          refreshInterval={refreshInterval}
          accessibilityLabel={accessibilityLabel}
          className={clsx(
            'transition-opacity duration-200',
            isLoading && 'opacity-50'
          )}
        />
      )}
    </div>
  );
};

export default PerformanceChart;