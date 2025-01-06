import React, { useEffect, useMemo, useCallback, useRef } from 'react';
import clsx from 'clsx';
import Chart from '../shared/Chart';
import { useAnalytics } from '../../hooks/useAnalytics';
import { MetricType, IChartData, TimeRange } from '../../types/analytics';
import { ANALYTICS_CONFIG, DESIGN_SYSTEM } from '../../lib/constants';

// Constants for revenue chart configuration
const REVENUE_CHART_DEFAULTS = {
  HEIGHT: 300,
  REFRESH_INTERVAL: 30000,
  TARGET_LINE_COLOR: DESIGN_SYSTEM.COLORS.success,
  REVENUE_LINE_COLOR: DESIGN_SYSTEM.COLORS.primary,
  COMPARISON_LINE_COLOR: DESIGN_SYSTEM.COLORS.secondary,
  MIN_UPDATE_INTERVAL: 200,
  VIRTUALIZATION_THRESHOLD: 1000,
  MOBILE_BREAKPOINT: DESIGN_SYSTEM.BREAKPOINTS.tablet,
  DEBOUNCE_DELAY: 150
};

// Props interface with comprehensive configuration options
interface RevenueChartProps {
  className?: string;
  height?: number;
  timeRange: TimeRange;
  showTargetLine?: boolean;
  targetValue?: number;
  refreshInterval?: number;
  enableVirtualization?: boolean;
  accessibilityLabel?: string;
  onDataPointClick?: (point: any) => void;
}

// Format revenue data with enhanced styling and calculations
const formatRevenueData = (data: IChartData): IChartData => {
  return {
    labels: data.labels,
    datasets: [
      {
        label: 'Revenue',
        data: data.datasets[0].data,
        color: REVENUE_CHART_DEFAULTS.REVENUE_LINE_COLOR,
        borderDash: []
      },
      {
        label: 'Previous Period',
        data: data.datasets[1]?.data || [],
        color: REVENUE_CHART_DEFAULTS.COMPARISON_LINE_COLOR,
        borderDash: [5, 5]
      }
    ],
    type: MetricType.REVENUE,
    thresholds: data.thresholds
  };
};

// Currency formatter for consistent display
const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0
});

/**
 * Enhanced RevenueChart component with real-time updates and accessibility
 */
const RevenueChart: React.FC<RevenueChartProps> = ({
  className,
  height = REVENUE_CHART_DEFAULTS.HEIGHT,
  timeRange,
  showTargetLine = true,
  targetValue,
  refreshInterval = REVENUE_CHART_DEFAULTS.REFRESH_INTERVAL,
  enableVirtualization = true,
  accessibilityLabel = 'Revenue trends over time',
  onDataPointClick
}) => {
  // Analytics hook with performance monitoring
  const {
    charts,
    isLoading,
    error,
    fetchChartData,
    subscribeToUpdates
  } = useAnalytics({
    refreshInterval: Math.max(refreshInterval, REVENUE_CHART_DEFAULTS.MIN_UPDATE_INTERVAL),
    enableRealTime: true,
    performanceMonitoring: true
  });

  // Refs for update tracking and performance optimization
  const updateCountRef = useRef(0);
  const lastUpdateTimeRef = useRef(Date.now());

  // Format chart data with memoization
  const chartData = useMemo(() => {
    if (!charts?.[MetricType.REVENUE]) return null;
    return formatRevenueData(charts[MetricType.REVENUE]);
  }, [charts]);

  // Enhanced tooltip formatter with period comparison
  const tooltipFormatter = useCallback((value: number) => {
    const formattedValue = currencyFormatter.format(value);
    const previousValue = chartData?.datasets[1]?.data[updateCountRef.current - 1];
    
    if (previousValue) {
      const changePercent = ((value - previousValue) / previousValue) * 100;
      return `${formattedValue} (${changePercent >= 0 ? '+' : ''}${changePercent.toFixed(1)}%)`;
    }
    
    return formattedValue;
  }, [chartData]);

  // Handle data point click with enhanced context
  const handleDataPointClick = useCallback((point: any) => {
    if (!onDataPointClick) return;

    const enhancedPoint = {
      ...point,
      formattedValue: currencyFormatter.format(point.value),
      timestamp: new Date(point.label).getTime(),
      periodComparison: {
        previousValue: chartData?.datasets[1]?.data[point.index],
        changePercent: chartData?.datasets[1]?.data[point.index]
          ? ((point.value - chartData.datasets[1].data[point.index]) / chartData.datasets[1].data[point.index]) * 100
          : null
      }
    };

    onDataPointClick(enhancedPoint);
  }, [onDataPointClick, chartData]);

  // Initialize chart data and real-time updates
  useEffect(() => {
    const initChart = async () => {
      try {
        await fetchChartData(MetricType.REVENUE, { timeRange });
        
        // Subscribe to real-time updates
        const unsubscribe = subscribeToUpdates((data) => {
          const currentTime = Date.now();
          if (currentTime - lastUpdateTimeRef.current >= REVENUE_CHART_DEFAULTS.MIN_UPDATE_INTERVAL) {
            updateCountRef.current += 1;
            lastUpdateTimeRef.current = currentTime;
          }
        });

        return unsubscribe;
      } catch (error) {
        console.error('Error initializing revenue chart:', error);
      }
    };

    initChart();
  }, [fetchChartData, subscribeToUpdates, timeRange]);

  // Error state handling
  if (error) {
    return (
      <div className={clsx('revenue-chart-error', className)} role="alert">
        <p>Error loading revenue data: {error}</p>
      </div>
    );
  }

  return (
    <div 
      className={clsx('revenue-chart-container', className)}
      role="region"
      aria-label={accessibilityLabel}
    >
      <Chart
        data={chartData || { labels: [], datasets: [], type: MetricType.REVENUE, thresholds: [] }}
        type="line"
        height={height}
        className="revenue-chart"
        showLegend={true}
        showGrid={true}
        showTooltip={true}
        showTargetLine={showTargetLine}
        targetValue={targetValue}
        refreshInterval={refreshInterval}
        tooltipFormat={tooltipFormatter}
        onDataPointClick={handleDataPointClick}
        accessibilityLabel={accessibilityLabel}
      />
      {isLoading && (
        <div 
          className="revenue-chart-loading"
          role="status"
          aria-label="Loading revenue data"
        >
          Loading...
        </div>
      )}
    </div>
  );
};

export default RevenueChart;