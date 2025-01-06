'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CampaignList } from '../../components/campaigns/CampaignList';
import { CampaignMetrics } from '../../components/campaigns/CampaignMetrics';
import { useCampaign } from '../../hooks/useCampaign';
import { useAnalytics } from '../../hooks/useAnalytics';
import { ICampaign, CampaignStatus } from '../../types/campaign';
import { ANALYTICS_CONFIG, API_CONFIG } from '../../lib/constants';
import Loading from '../../components/shared/Loading';

/**
 * Enhanced campaign management page with real-time updates and AI optimization
 */
const CampaignsPage: React.FC = () => {
  const router = useRouter();
  const [selectedCampaign, setSelectedCampaign] = useState<ICampaign | null>(null);

  // Initialize campaign hook with real-time updates
  const {
    campaigns,
    loading,
    error,
    actions: { refresh: fetchCampaigns, optimize: optimizeCampaign }
  } = useCampaign();

  // Initialize analytics hook for performance tracking
  const { trackEvent, subscribeToUpdates, unsubscribeFromUpdates } = useAnalytics({
    refreshInterval: ANALYTICS_CONFIG.UPDATE_INTERVAL,
    enableRealTime: true,
    performanceMonitoring: true
  });

  // Handle campaign selection
  const handleCampaignSelect = useCallback((campaign: ICampaign) => {
    setSelectedCampaign(campaign);
    trackEvent({
      category: 'Campaign',
      action: 'select_campaign',
      label: campaign.id
    });
  }, [trackEvent]);

  // Handle campaign actions with optimistic updates
  const handleCampaignAction = useCallback(async (
    actionType: 'edit' | 'pause' | 'resume',
    campaignId: string
  ) => {
    try {
      switch (actionType) {
        case 'edit':
          router.push(`/campaigns/${campaignId}/edit`);
          break;
        case 'pause':
          await optimizeCampaign(campaignId);
          await fetchCampaigns();
          break;
        case 'resume':
          await optimizeCampaign(campaignId);
          await fetchCampaigns();
          break;
      }

      trackEvent({
        category: 'Campaign',
        action: `campaign_${actionType}`,
        label: campaignId
      });
    } catch (error) {
      console.error(`Campaign ${actionType} error:`, error);
      throw error;
    }
  }, [router, optimizeCampaign, fetchCampaigns, trackEvent]);

  // Handle threshold alerts for campaign metrics
  const handleThresholdAlert = useCallback((metric: string, value: number) => {
    trackEvent({
      category: 'Campaign',
      action: 'threshold_alert',
      label: metric,
      value
    });
  }, [trackEvent]);

  // Subscribe to real-time updates
  useEffect(() => {
    const unsubscribe = subscribeToUpdates((data) => {
      if (data.metrics) {
        fetchCampaigns();
      }
    });

    return () => {
      unsubscribe();
      unsubscribeFromUpdates();
    };
  }, [subscribeToUpdates, unsubscribeFromUpdates, fetchCampaigns]);

  // Initial data fetch
  useEffect(() => {
    fetchCampaigns();
  }, [fetchCampaigns]);

  return (
    <div className="container mx-auto px-4 py-8 space-y-8">
      {/* Page Header */}
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-semibold text-gray-900">
          Campaign Management
        </h1>
        <button
          onClick={() => router.push('/campaigns/new')}
          className="bg-primary-600 text-white px-4 py-2 rounded-md hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500"
        >
          Create Campaign
        </button>
      </div>

      {/* Loading State */}
      {loading && !campaigns && (
        <div className="flex justify-center items-center min-h-[400px]">
          <Loading size="lg" variant="primary" />
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="bg-red-50 p-4 rounded-md" role="alert">
          <p className="text-sm text-red-700">{error}</p>
          <button
            onClick={fetchCampaigns}
            className="mt-2 text-sm text-red-700 hover:text-red-800 font-medium"
          >
            Retry
          </button>
        </div>
      )}

      {/* Campaign Metrics */}
      {selectedCampaign && (
        <CampaignMetrics
          campaign={selectedCampaign}
          refreshInterval={ANALYTICS_CONFIG.UPDATE_INTERVAL}
          onThresholdAlert={handleThresholdAlert}
          websocketUrl={`${API_CONFIG.BASE_URL}/campaign-metrics`}
          className="mb-8"
        />
      )}

      {/* Campaign List */}
      {campaigns && (
        <CampaignList
          onEdit={(id) => handleCampaignAction('edit', id)}
          onPause={(id) => handleCampaignAction('pause', id)}
          onResume={(id) => handleCampaignAction('resume', id)}
          pageSize={25}
          initialFilters={{
            status: [CampaignStatus.ACTIVE, CampaignStatus.PAUSED]
          }}
          className="min-h-[400px]"
        />
      )}
    </div>
  );
};

export default CampaignsPage;