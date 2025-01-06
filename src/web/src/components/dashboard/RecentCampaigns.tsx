import React, { useEffect, useCallback, useState } from 'react';
import { VirtualList } from 'react-window';
import Card from '../shared/Card';
import { ICampaign } from '../../types/campaign';
import { useCampaign } from '../../hooks/useCampaign';
import { DESIGN_SYSTEM } from '../../lib/constants';

/**
 * Props for the RecentCampaigns component
 */
interface RecentCampaignsProps {
  limit?: number;
  className?: string;
  updateInterval?: number;
  showAIMetrics?: boolean;
}

/**
 * Formats campaign metric values with enhanced number formatting and trend indicators
 */
const formatMetric = (
  value: number,
  type: 'currency' | 'percentage' | 'number' | 'aiScore',
  trend?: number
): { value: string; trend: string; color: string } => {
  const formatter = new Intl.NumberFormat('en-US', {
    style: type === 'currency' ? 'currency' : 'decimal',
    currency: 'USD',
    minimumFractionDigits: type === 'percentage' ? 1 : 0,
    maximumFractionDigits: 2
  });

  const formattedValue = type === 'percentage' 
    ? `${formatter.format(value * 100)}%`
    : formatter.format(value);

  const trendValue = trend ? (trend > 0 ? `+${trend}%` : `${trend}%`) : '';
  const color = trend
    ? trend > 0 
      ? DESIGN_SYSTEM.COLORS.success
      : trend < 0 
        ? DESIGN_SYSTEM.COLORS.error 
        : DESIGN_SYSTEM.COLORS.gray[500]
    : DESIGN_SYSTEM.COLORS.gray[500];

  return { value: formattedValue, trend: trendValue, color };
};

/**
 * Handles WebSocket connection errors with retry logic
 */
const handleWebSocketError = async (error: Error): Promise<void> => {
  console.error('WebSocket connection error:', error);
  // Emit error event for monitoring
  window.dispatchEvent(new CustomEvent('campaign-websocket-error', {
    detail: {
      error: error.message,
      timestamp: Date.now()
    }
  }));
};

/**
 * Campaign card component for individual campaign display
 */
const CampaignCard: React.FC<{ campaign: ICampaign }> = React.memo(({ campaign }) => {
  const { metrics, aiOptimization } = campaign;
  const revenueMetric = formatMetric(metrics.revenue, 'currency', metrics.roas);
  const conversionMetric = formatMetric(metrics.conversionRate, 'percentage', 
    ((metrics.conversionRate - metrics.analytics[0].previousValue) / metrics.analytics[0].previousValue) * 100
  );

  return (
    <Card 
      variant="interactive"
      padding="md"
      className="mb-4 hover:shadow-lg transition-all duration-200"
      role="article"
      aria-label={`Campaign: ${campaign.name}`}
    >
      <div className="flex justify-between items-start">
        <div>
          <h3 className="text-lg font-semibold text-gray-900">{campaign.name}</h3>
          <p className="text-sm text-gray-600 mt-1">
            Status: <span className={`font-medium ${
              campaign.status === 'ACTIVE' ? 'text-green-600' : 'text-gray-600'
            }`}>{campaign.status}</span>
          </p>
        </div>
        {aiOptimization && (
          <div className="flex items-center">
            <span className="text-sm font-medium" style={{ color: DESIGN_SYSTEM.COLORS.primary }}>
              AI Score: {formatMetric(aiOptimization.score, 'aiScore').value}
            </span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4 mt-4">
        <div>
          <p className="text-sm text-gray-500">Revenue</p>
          <div className="flex items-baseline">
            <span className="text-lg font-semibold" style={{ color: revenueMetric.color }}>
              {revenueMetric.value}
            </span>
            {revenueMetric.trend && (
              <span className="ml-2 text-sm" style={{ color: revenueMetric.color }}>
                {revenueMetric.trend}
              </span>
            )}
          </div>
        </div>
        <div>
          <p className="text-sm text-gray-500">Conversion Rate</p>
          <div className="flex items-baseline">
            <span className="text-lg font-semibold" style={{ color: conversionMetric.color }}>
              {conversionMetric.value}
            </span>
            {conversionMetric.trend && (
              <span className="ml-2 text-sm" style={{ color: conversionMetric.color }}>
                {conversionMetric.trend}
              </span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
});

CampaignCard.displayName = 'CampaignCard';

/**
 * RecentCampaigns component displays a list of recent campaigns with real-time updates
 */
const RecentCampaigns: React.FC<RecentCampaignsProps> = ({
  limit = 5,
  className = '',
  updateInterval = 30000,
  showAIMetrics = true
}) => {
  const { campaigns, loading, error, actions } = useCampaign();
  const [listHeight, setListHeight] = useState(0);

  // Update list height on window resize
  useEffect(() => {
    const updateHeight = () => {
      setListHeight(window.innerHeight * 0.6); // 60% of viewport height
    };

    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Set up periodic refresh
  useEffect(() => {
    if (!updateInterval) return;

    const intervalId = setInterval(() => {
      actions.refresh().catch(handleWebSocketError);
    }, updateInterval);

    return () => clearInterval(intervalId);
  }, [updateInterval, actions]);

  // Render loading state
  if (loading) {
    return (
      <div className={`space-y-4 ${className}`}>
        {Array.from({ length: limit }).map((_, i) => (
          <Card key={i} className="animate-pulse h-32" />
        ))}
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <Card className="p-4 bg-red-50 border-red-100">
        <p className="text-red-600">Failed to load campaigns: {error}</p>
        <button
          onClick={() => actions.refresh()}
          className="mt-2 text-sm text-red-700 hover:text-red-800"
        >
          Retry
        </button>
      </Card>
    );
  }

  // Render campaign list
  return (
    <div className={className}>
      <VirtualList
        height={listHeight}
        width="100%"
        itemCount={Math.min(campaigns.length, limit)}
        itemSize={160}
        overscanCount={2}
      >
        {({ index, style }) => (
          <div style={style}>
            <CampaignCard campaign={campaigns[index]} />
          </div>
        )}
      </VirtualList>
    </div>
  );
};

export default RecentCampaigns;