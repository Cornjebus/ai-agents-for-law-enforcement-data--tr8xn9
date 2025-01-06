import React, { useEffect, useMemo, useCallback } from 'react';
import { formatCurrency, formatNumber } from 'numeral';
import { ErrorBoundary } from 'react-error-boundary';
import { useA11y } from '@accessibility/react-a11y';
import Card from '../shared/Card';
import { useAnalytics } from '../../hooks/useAnalytics';
import { MetricType } from '../../types/analytics';
import { DESIGN_SYSTEM, ANALYTICS_CONFIG } from '../../lib/constants';

// Props interface for the MetricsOverview component
interface MetricsOverviewProps {
  className?: string;
  refreshInterval?: number;
  onError?: (error: Error) => void;
}

/**
 * Formats metric value based on metric type with localization support
 */
const formatMetricValue = (type: MetricType, value: number, locale: string = 'en-US'): string => {
  switch (type) {
    case MetricType.REVENUE:
      return formatCurrency(value).format('$0,0.00');
    case MetricType.CONVERSION_RATE:
      return formatNumber(value).format('0.00%');
    case MetricType.CALL_VOLUME:
      return formatNumber(value).format('0,0');
    default:
      return formatNumber(value).format('0,0.00');
  }
};

/**
 * Returns trend indicator configuration with accessibility labels
 */
const getTrendIndicator = (changePercentage: number) => {
  const isPositive = changePercentage > 0;
  const isNeutral = changePercentage === 0;

  return {
    icon: isPositive ? '↑' : isNeutral ? '→' : '↓',
    className: `text-sm font-medium ${
      isPositive ? 'text-success' : isNeutral ? 'text-gray-500' : 'text-error'
    }`,
    ariaLabel: `${Math.abs(changePercentage).toFixed(1)}% ${
      isPositive ? 'increase' : isNeutral ? 'no change' : 'decrease'
    }`,
  };
};

/**
 * MetricsOverview component displays key business metrics in a responsive grid layout
 * with real-time updates and accessibility support
 */
const MetricsOverview: React.FC<MetricsOverviewProps> = ({
  className = '',
  refreshInterval = ANALYTICS_CONFIG.UPDATE_INTERVAL,
  onError,
}) => {
  const { metrics, isLoading, error, subscribeToUpdates } = useAnalytics();
  const { setAriaLive } = useA11y();

  // Handle real-time metric updates
  const handleMetricUpdate = useCallback((updatedMetrics) => {
    // Announce significant changes for screen readers
    updatedMetrics.forEach(metric => {
      if (Math.abs(metric.changePercentage) > 10) {
        setAriaLive(`${metric.type} has changed by ${metric.changePercentage.toFixed(1)}%`);
      }
    });
  }, [setAriaLive]);

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubscribe = subscribeToUpdates(handleMetricUpdate);
    return () => unsubscribe();
  }, [subscribeToUpdates, handleMetricUpdate]);

  // Error handling
  useEffect(() => {
    if (error && onError) {
      onError(new Error(error));
    }
  }, [error, onError]);

  // Memoized grid layout classes
  const gridClasses = useMemo(() => 
    'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 ' + className,
    [className]
  );

  if (isLoading) {
    return (
      <div className={gridClasses} role="status" aria-label="Loading metrics">
        {[...Array(4)].map((_, i) => (
          <Card key={i} className="animate-pulse h-32" />
        ))}
      </div>
    );
  }

  return (
    <ErrorBoundary fallback={<div>Error loading metrics</div>} onError={onError}>
      <div 
        className={gridClasses}
        role="region"
        aria-label="Key performance metrics"
      >
        {metrics?.map(metric => {
          const trend = getTrendIndicator(metric.changePercentage);
          
          return (
            <Card
              key={metric.id}
              className="p-4"
              role="article"
              aria-labelledby={`metric-${metric.id}-title`}
            >
              <div className="flex flex-col h-full">
                <h3
                  id={`metric-${metric.id}-title`}
                  className="text-gray-500 text-sm font-medium mb-2"
                >
                  {metric.type.replace(/_/g, ' ')}
                </h3>
                
                <div className="flex items-baseline justify-between">
                  <span 
                    className="text-2xl font-semibold"
                    aria-label={`Current value: ${formatMetricValue(metric.type, metric.value)}`}
                  >
                    {formatMetricValue(metric.type, metric.value)}
                  </span>
                  
                  <span
                    className={trend.className}
                    aria-label={trend.ariaLabel}
                  >
                    {trend.icon} {Math.abs(metric.changePercentage).toFixed(1)}%
                  </span>
                </div>

                {metric.status !== 'normal' && (
                  <div
                    className={`mt-2 text-sm ${
                      metric.status === 'warning' ? 'text-warning' : 'text-error'
                    }`}
                    role="alert"
                  >
                    {metric.status === 'warning' ? 'Warning: ' : 'Critical: '}
                    Exceeding threshold
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </ErrorBoundary>
  );
};

export default MetricsOverview;