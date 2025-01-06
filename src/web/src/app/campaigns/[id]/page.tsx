'use client';

import React, { useEffect, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useRBAC } from '@auth/rbac';
import CampaignMetrics from '../../../components/campaigns/CampaignMetrics';
import CampaignCard from '../../../components/campaigns/CampaignCard';
import { useCampaign } from '../../../hooks/useCampaign';
import { UserRole } from '../../../types/auth';
import { CampaignStatus } from '../../../types/campaign';
import { ANALYTICS_CONFIG } from '../../../lib/constants';

interface PageParams {
  id: string;
}

interface CampaignUpdatePayload {
  status: CampaignStatus;
  settings: Record<string, unknown>;
}

const CampaignPage: React.FC = () => {
  const params = useParams();
  const router = useRouter();
  const { hasPermission } = useRBAC();
  
  // Extract campaign ID from route parameters
  const campaignId = params?.id as string;

  // Initialize campaign management hook with real-time updates
  const {
    campaign,
    loading,
    error,
    metrics,
    optimization,
    actions: { refresh, optimize, updateMetrics }
  } = useCampaign(campaignId);

  // Check user permissions for campaign management
  const canManageCampaign = useMemo(() => 
    hasPermission(UserRole.MANAGER) || hasPermission(UserRole.ADMIN),
    [hasPermission]
  );

  // Handle campaign status updates with optimistic UI
  const handleCampaignUpdate = useCallback(async (
    action: 'pause' | 'resume' | 'edit'
  ) => {
    if (!campaign || !canManageCampaign) return;

    try {
      const newStatus = action === 'pause' ? 
        CampaignStatus.PAUSED : 
        action === 'resume' ? 
          CampaignStatus.ACTIVE : 
          campaign.status;

      // Optimistically update UI
      updateMetrics({
        ...metrics,
        status: newStatus
      });

      if (action === 'edit') {
        router.push(`/campaigns/${campaignId}/edit`);
        return;
      }

      // Perform actual update
      await optimize();
      await refresh();
    } catch (err) {
      // Revert optimistic update on error
      updateMetrics({
        ...metrics,
        status: campaign.status
      });
      console.error('Campaign update failed:', err);
    }
  }, [campaign, canManageCampaign, campaignId, metrics, optimize, refresh, router, updateMetrics]);

  // Setup automatic refresh interval
  useEffect(() => {
    const intervalId = setInterval(() => {
      refresh();
    }, ANALYTICS_CONFIG.UPDATE_INTERVAL);

    return () => clearInterval(intervalId);
  }, [refresh]);

  // Handle loading state
  if (loading) {
    return (
      <div className="animate-pulse p-8">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="h-32 bg-gray-200 rounded" />
          ))}
        </div>
      </div>
    );
  }

  // Handle error state
  if (error || !campaign) {
    return (
      <div className="p-8 text-center">
        <h2 className="text-xl font-semibold text-gray-900 mb-4">
          {error || 'Campaign not found'}
        </h2>
        <button
          onClick={() => router.back()}
          className="text-primary-600 hover:text-primary-700"
        >
          Go Back
        </button>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Campaign Header */}
      <div className="mb-6">
        <CampaignCard
          campaign={campaign}
          onEdit={() => handleCampaignUpdate('edit')}
          onPause={() => handleCampaignUpdate('pause')}
          onResume={() => handleCampaignUpdate('resume')}
          isLoading={optimization.inProgress}
          error={optimization.error ? new Error(optimization.error) : null}
          onRetry={refresh}
        />
      </div>

      {/* Campaign Metrics */}
      <div className="mt-8">
        <CampaignMetrics
          campaign={campaign}
          refreshInterval={ANALYTICS_CONFIG.UPDATE_INTERVAL}
          thresholds={{
            revenue: campaign.config.budget.daily,
            roas: campaign.config.optimization.constraints.minROAS,
            conversionRate: 0.15,
            aiConfidence: 0.8
          }}
          onThresholdAlert={(metric, value) => {
            console.warn(`Threshold alert: ${metric} = ${value}`);
          }}
          websocketUrl={`${process.env.NEXT_PUBLIC_WS_URL}/campaign-metrics`}
        />
      </div>

      {/* AI Optimization Status */}
      {optimization.inProgress && (
        <div className="mt-6 bg-blue-50 p-4 rounded-lg">
          <p className="text-blue-700 text-sm">
            AI optimization in progress... Current score: {optimization.score}
          </p>
          {optimization.recommendations.length > 0 && (
            <ul className="mt-2 text-sm text-blue-600">
              {optimization.recommendations.map((rec, index) => (
                <li key={index}>{rec}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
};

export default CampaignPage;