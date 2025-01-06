'use client';

import React, { useEffect, useCallback, useState, useMemo } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { ErrorBoundary } from 'react-error-boundary';
import clsx from 'clsx';

import MetricsCard from '../../components/analytics/MetricsCard';
import PerformanceChart from '../../components/analytics/PerformanceChart';
import RevenueChart from '../../components/analytics/RevenueChart';
import { useAnalytics } from '../../hooks/useAnalytics';

import { MetricType, TimeRange, IAnalyticsMetric } from '../../types/analytics';
import { ANALYTICS_CONFIG, DESIGN_SYSTEM } from '../../lib/constants';

// Constants for analytics dashboard
const REFRESH_INTERVAL = 30000; // 30 seconds
const DEFAULT_CHART_HEIGHT = 300;
const METRICS_GRID_COLS = {
  sm: 1,
  md: 2,
  lg: 3
};
const DEFAULT_TIME_RANGE = TimeRange.LAST_30_DAYS;
const UPDATE_THROTTLE_MS = 200;

/**
 * Error fallback component for analytics dashboard
 */
const ErrorFallback = ({ error }: { error: Error }) => (
  <div 
    className="p-4 bg-error-50 border border-error-200 rounded-lg"
    role="alert"
  >
    <h3 className="text-error-700 font-semibold mb-2">Error Loading Analytics</h3>
    <p className="text-error-600">{error.message}</p>
  </div>
);

/**
 * Analytics Dashboard Page Component
 * Implements real-time metrics, performance monitoring, and accessibility
 */
const AnalyticsPage = () => {
  // Analytics hook with real-time updates
  const {
    metrics,
    charts,
    isLoading,
    error,
    fetchMetricsData,
    fetchChartData,
    subscribeToUpdates,
    unsubscribeFromUpdates
  } = useAnalytics({
    refreshInterval: REFRESH_INTERVAL,
    enableRealTime: true,
    performanceMonitoring: true
  });

  // Local state for filters and selected metrics
  const [timeRange, setTimeRange] = useState<TimeRange>(DEFAULT_TIME_RANGE);
  const [selectedMetric, setSelectedMetric] = useState<MetricType | null>(null);

  // Virtualization for performance metrics
  const parentRef = React.useRef<HTMLDivElement>(null);
  const metricsArray = useMemo(() => metrics || [], [metrics]);
  
  const rowVirtualizer = useVirtualizer({
    count: metricsArray.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 100,
    overscan: 5
  });

  /**
   * Handle metric card click with analytics tracking
   */
  const handleMetricClick = useCallback((metric: IAnalyticsMetric) => {
    setSelectedMetric(metric.type);
    // Update URL without navigation
    window.history.replaceState(
      {},
      '',
      `?metric=${metric.type.toLowerCase()}&timeRange=${timeRange}`
    );
  }, [timeRange]);

  /**
   * Handle time range change with debouncing
   */
  const handleTimeRangeChange = useCallback((range: TimeRange) => {
    setTimeRange(range);
    // Fetch new data for the selected range
    fetchMetricsData({ timeRange: range }).catch(console.error);
    if (selectedMetric) {
      fetchChartData(selectedMetric, { timeRange: range }).catch(console.error);
    }
  }, [fetchMetricsData, fetchChartData, selectedMetric]);

  // Initialize data and WebSocket subscription
  useEffect(() => {
    const initDashboard = async () => {
      try {
        await fetchMetricsData({ timeRange });
        const unsubscribe = subscribeToUpdates((update) => {
          // Throttle updates for performance
          setTimeout(() => {
            if (selectedMetric) {
              fetchChartData(selectedMetric, { timeRange }).catch(console.error);
            }
          }, UPDATE_THROTTLE_MS);
        });

        return () => {
          unsubscribe();
          unsubscribeFromUpdates();
        };
      } catch (error) {
        console.error('Dashboard initialization error:', error);
      }
    };

    initDashboard();
  }, [fetchMetricsData, fetchChartData, subscribeToUpdates, unsubscribeFromUpdates, timeRange, selectedMetric]);

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div className="analytics-dashboard p-6 space-y-6">
        {/* Header Section */}
        <header className="flex justify-between items-center">
          <h1 className={clsx(
            'text-2xl font-semibold text-gray-900',
            DESIGN_SYSTEM.TYPOGRAPHY.fontFamily.primary
          )}>
            Analytics Dashboard
          </h1>
          
          {/* Time Range Selector */}
          <select
            value={timeRange}
            onChange={(e) => handleTimeRangeChange(e.target.value as TimeRange)}
            className={clsx(
              'rounded-lg border-gray-300',
              'px-4 py-2',
              'focus:ring-2 focus:ring-primary-500'
            )}
            aria-label="Select time range"
          >
            {Object.values(TimeRange).map((range) => (
              <option key={range} value={range}>
                {range.replace('_', ' ').toLowerCase()}
              </option>
            ))}
          </select>
        </header>

        {/* Key Metrics Grid */}
        <div className={clsx(
          'grid gap-6',
          'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
        )}>
          {metricsArray.map((metric) => (
            <MetricsCard
              key={metric.id}
              metric={metric}
              onClick={() => handleMetricClick(metric)}
              className="h-full"
            />
          ))}
        </div>

        {/* Revenue Chart Section */}
        <section 
          className="space-y-4"
          aria-labelledby="revenue-heading"
        >
          <h2 
            id="revenue-heading"
            className="text-xl font-semibold text-gray-900"
          >
            Revenue Overview
          </h2>
          <RevenueChart
            timeRange={timeRange}
            height={DEFAULT_CHART_HEIGHT}
            showTargetLine
            className="bg-white rounded-lg shadow-sm p-4"
          />
        </section>

        {/* Performance Metrics Section */}
        <section 
          className="space-y-4"
          aria-labelledby="performance-heading"
        >
          <h2 
            id="performance-heading"
            className="text-xl font-semibold text-gray-900"
          >
            Performance Metrics
          </h2>
          <div ref={parentRef} className="h-[600px] overflow-auto">
            {rowVirtualizer.getVirtualItems().map((virtualRow) => (
              <PerformanceChart
                key={virtualRow.key}
                metricType={metricsArray[virtualRow.index].type}
                timeRange={timeRange}
                height={DEFAULT_CHART_HEIGHT}
                className="bg-white rounded-lg shadow-sm p-4 mb-4"
              />
            ))}
          </div>
        </section>

        {/* AI Insights Section */}
        <section 
          className="space-y-4"
          aria-labelledby="insights-heading"
        >
          <h2 
            id="insights-heading"
            className="text-xl font-semibold text-gray-900"
          >
            AI Insights
          </h2>
          <div className="bg-white rounded-lg shadow-sm p-6">
            {charts?.insights?.map((insight, index) => (
              <div 
                key={index}
                className="flex items-start space-x-3 mb-4"
              >
                <span className="text-primary-500">•</span>
                <p className="text-gray-700">{insight}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Loading Overlay */}
        {isLoading && (
          <div 
            className={clsx(
              'fixed inset-0 bg-white/50',
              'flex items-center justify-center',
              'z-50'
            )}
            role="status"
            aria-label="Loading dashboard data"
          >
            <div className="loading-spinner" />
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default AnalyticsPage;