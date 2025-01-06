import React from 'react';
import clsx from 'clsx';
import Card from '../shared/Card';
import { IAnalyticsMetric, MetricType } from '../../types/analytics';
import { DESIGN_SYSTEM, ANALYTICS_CONFIG } from '../../lib/constants';

interface MetricsCardProps {
  metric: IAnalyticsMetric;
  className?: string;
  onClick?: () => void;
}

/**
 * Formats metric value based on type with internationalization support
 * @param value - Raw metric value to format
 * @param type - Type of metric determining format style
 */
const formatMetricValue = (value: number, type: MetricType): string => {
  const locale = document.documentElement.lang || 'en-US';
  const rtl = document.documentElement.dir === 'rtl';
  
  switch (type) {
    case MetricType.REVENUE:
      return new Intl.NumberFormat(locale, {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
      }).format(value);
      
    case MetricType.CONVERSION_RATE:
      return new Intl.NumberFormat(locale, {
        style: 'percent',
        minimumFractionDigits: 1,
        maximumFractionDigits: 1
      }).format(value / 100);
      
    case MetricType.CALL_VOLUME:
      return new Intl.NumberFormat(locale, {
        style: 'decimal',
        useGrouping: true
      }).format(value);
      
    default:
      return new Intl.NumberFormat(locale).format(value);
  }
};

/**
 * Determines trend direction and styling with accessibility support
 * @param changePercentage - Percentage change in metric value
 */
const getTrendIndicator = (changePercentage: number) => {
  const isPositive = changePercentage > 0;
  const isNeutral = changePercentage === 0;
  
  return {
    icon: isPositive ? '↑' : isNeutral ? '→' : '↓',
    className: clsx(
      'inline-flex items-center text-sm font-medium',
      isPositive && 'text-success-600',
      isNeutral && 'text-gray-500',
      !isPositive && !isNeutral && 'text-error-600'
    ),
    ariaLabel: `${Math.abs(changePercentage).toFixed(1)}% ${
      isPositive ? 'increase' : isNeutral ? 'no change' : 'decrease'
    } from previous period`
  };
};

/**
 * MetricsCard component for displaying analytics metrics with real-time updates
 * Implements design system specifications and accessibility requirements
 */
export const MetricsCard: React.FC<MetricsCardProps> = React.memo(({ 
  metric,
  className,
  onClick
}) => {
  const { type, value, previousValue, changePercentage } = metric;
  const trend = getTrendIndicator(changePercentage);
  
  return (
    <Card
      variant={onClick ? 'interactive' : 'default'}
      padding="lg"
      className={clsx(
        'min-w-[200px]',
        'transition-all duration-200',
        className
      )}
      onClick={onClick}
      role="region"
      aria-label={`${type.toLowerCase().replace('_', ' ')} metric card`}
    >
      <div className="space-y-2">
        <h3 className={clsx(
          'text-gray-600 text-sm font-medium',
          'uppercase tracking-wide'
        )}>
          {type.toLowerCase().replace('_', ' ')}
        </h3>
        
        <div className="flex items-baseline justify-between">
          <span className={clsx(
            'text-2xl font-semibold',
            'text-gray-900'
          )}>
            {formatMetricValue(value, type)}
          </span>
          
          <div 
            className={trend.className}
            aria-label={trend.ariaLabel}
          >
            <span className="mr-1" aria-hidden="true">
              {trend.icon}
            </span>
            <span>
              {Math.abs(changePercentage).toFixed(1)}%
            </span>
          </div>
        </div>
        
        {metric.threshold && (
          <div 
            className={clsx(
              'text-xs text-gray-500',
              'mt-1'
            )}
          >
            Threshold: {formatMetricValue(metric.threshold, type)}
          </div>
        )}
      </div>
    </Card>
  );
});

MetricsCard.displayName = 'MetricsCard';

export default MetricsCard;