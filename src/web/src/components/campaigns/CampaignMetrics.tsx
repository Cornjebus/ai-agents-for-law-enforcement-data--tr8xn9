import React, { useMemo, useEffect, useCallback } from 'react';
import clsx from 'clsx'; // v2.0.0
import { useWebSocket } from 'react-use-websocket'; // v4.3.1
import { ICampaign, ICampaignMetrics, IAIMetrics } from '../../types/campaign';
import Chart from '../shared/Chart';

interface IMetricThresholds {
  revenue: number;
  roas: number;
  conversionRate: number;
  aiConfidence: number;
}

interface CampaignMetricsProps {
  campaign: ICampaign;
  className?: string;
  refreshInterval?: number;
  thresholds?: IMetricThresholds;
  onThresholdAlert?: (metric: string, value: number) => void;
  websocketUrl?: string;
}

const DEFAULT_THRESHOLDS: IMetricThresholds = {
  revenue: 10000,
  roas: 2.5,
  conversionRate: 0.15,
  aiConfidence: 0.8
};

const METRIC_COLORS = {
  revenue: '#2563EB',
  roas: '#059669',
  conversion: '#3B82F6',
  aiMetrics: '#9333EA'
};

const formatCurrency = (value: number): string => 
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(value);

const formatPercentage = (value: number): string => 
  `${(value * 100).toFixed(1)}%`;

const calculateTrends = (metrics: ICampaignMetrics, aiMetrics: IAIMetrics) => {
  return {
    revenue: {
      trend: metrics.revenue > metrics.analytics[0].value ? 'up' : 'down',
      confidence: aiMetrics.confidenceLevel
    },
    roas: {
      trend: metrics.roas > metrics.analytics[0].value ? 'up' : 'down',
      confidence: aiMetrics.optimizationScore
    },
    conversion: {
      trend: metrics.conversionRate > metrics.analytics[0].value ? 'up' : 'down',
      confidence: aiMetrics.accuracy
    }
  };
};

const formatMetricsData = (
  metrics: ICampaignMetrics,
  aiMetrics: IAIMetrics,
  thresholds: IMetricThresholds
) => {
  const trends = calculateTrends(metrics, aiMetrics);
  
  return {
    summary: [
      {
        label: 'Revenue',
        value: formatCurrency(metrics.revenue),
        trend: trends.revenue.trend,
        status: metrics.revenue >= thresholds.revenue ? 'success' : 'warning',
        confidence: trends.revenue.confidence
      },
      {
        label: 'ROAS',
        value: metrics.roas.toFixed(2),
        trend: trends.roas.trend,
        status: metrics.roas >= thresholds.roas ? 'success' : 'warning',
        confidence: trends.roas.confidence
      },
      {
        label: 'Conversion Rate',
        value: formatPercentage(metrics.conversionRate),
        trend: trends.conversion.trend,
        status: metrics.conversionRate >= thresholds.conversionRate ? 'success' : 'warning',
        confidence: trends.conversion.confidence
      },
      {
        label: 'AI Confidence',
        value: formatPercentage(aiMetrics.confidenceLevel),
        status: aiMetrics.confidenceLevel >= thresholds.aiConfidence ? 'success' : 'warning',
        confidence: aiMetrics.accuracy
      }
    ],
    chartData: {
      labels: metrics.analytics.map(m => new Date(m.timestamp).toLocaleDateString()),
      datasets: [
        {
          label: 'Revenue',
          data: metrics.analytics.map(m => m.value),
          color: METRIC_COLORS.revenue
        },
        {
          label: 'Target',
          data: metrics.analytics.map(() => thresholds.revenue),
          color: METRIC_COLORS.revenue,
          borderDash: [5, 5]
        }
      ]
    }
  };
};

export const CampaignMetrics: React.FC<CampaignMetricsProps> = ({
  campaign,
  className,
  refreshInterval = 30000,
  thresholds = DEFAULT_THRESHOLDS,
  onThresholdAlert,
  websocketUrl
}) => {
  const { lastMessage, sendMessage } = useWebSocket(websocketUrl, {
    shouldReconnect: () => true,
    reconnectInterval: 3000
  });

  const metricsData = useMemo(() => 
    formatMetricsData(campaign.metrics, campaign.metrics.aiMetrics, thresholds),
    [campaign.metrics, thresholds]
  );

  const checkThresholds = useCallback(() => {
    if (!onThresholdAlert) return;

    if (campaign.metrics.revenue < thresholds.revenue) {
      onThresholdAlert('revenue', campaign.metrics.revenue);
    }
    if (campaign.metrics.roas < thresholds.roas) {
      onThresholdAlert('roas', campaign.metrics.roas);
    }
    if (campaign.metrics.conversionRate < thresholds.conversionRate) {
      onThresholdAlert('conversionRate', campaign.metrics.conversionRate);
    }
    if (campaign.metrics.aiMetrics.confidenceLevel < thresholds.aiConfidence) {
      onThresholdAlert('aiConfidence', campaign.metrics.aiMetrics.confidenceLevel);
    }
  }, [campaign.metrics, thresholds, onThresholdAlert]);

  useEffect(() => {
    checkThresholds();
  }, [checkThresholds]);

  useEffect(() => {
    if (lastMessage) {
      const updatedMetrics = JSON.parse(lastMessage.data);
      // Handle real-time metric updates
    }
  }, [lastMessage]);

  return (
    <div className={clsx('space-y-6', className)}>
      {/* Metrics Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricsData.summary.map((metric, index) => (
          <div
            key={index}
            className={clsx(
              'p-4 rounded-lg shadow-sm',
              metric.status === 'success' ? 'bg-green-50' : 'bg-yellow-50'
            )}
          >
            <div className="text-sm font-medium text-gray-500">{metric.label}</div>
            <div className="mt-1 text-2xl font-semibold">{metric.value}</div>
            <div className="mt-1 flex items-center space-x-2">
              {metric.trend && (
                <span className={clsx(
                  'text-sm',
                  metric.trend === 'up' ? 'text-green-600' : 'text-red-600'
                )}>
                  {metric.trend === 'up' ? '↑' : '↓'}
                </span>
              )}
              <span className="text-sm text-gray-500">
                Confidence: {formatPercentage(metric.confidence)}
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Revenue Chart */}
      <div className="bg-white p-4 rounded-lg shadow-sm">
        <Chart
          data={metricsData.chartData}
          type="line"
          height={300}
          showGrid={true}
          showLegend={true}
          showTooltip={true}
          showTargetLine={true}
          targetValue={thresholds.revenue}
          thresholds={{
            warning: thresholds.revenue * 0.8,
            critical: thresholds.revenue * 0.5
          }}
          refreshInterval={refreshInterval}
          tooltipFormat={formatCurrency}
          accessibilityLabel="Campaign revenue chart with target thresholds"
        />
      </div>

      {/* AI Insights */}
      <div className="bg-gray-50 p-4 rounded-lg">
        <h3 className="text-lg font-medium text-gray-900">AI Insights</h3>
        <div className="mt-2 space-y-2">
          <div className="flex items-center space-x-2">
            <span className="text-purple-600">●</span>
            <span>
              Model Confidence: {formatPercentage(campaign.metrics.aiMetrics.confidenceLevel)}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-blue-600">●</span>
            <span>
              Optimization Score: {formatPercentage(campaign.metrics.aiMetrics.optimizationScore)}
            </span>
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-green-600">●</span>
            <span>
              Response Time: {campaign.metrics.aiMetrics.responseTime}ms
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CampaignMetrics;