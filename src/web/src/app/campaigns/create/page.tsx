'use client';

import React, { useCallback, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useNotification } from '@/hooks/useNotification';
import { useRBAC } from '@auth/rbac';
import { ErrorBoundary } from '@/components/ErrorBoundary';
import CampaignForm from '../../../components/campaigns/CampaignForm';
import { useCreateCampaign } from '../../../hooks/useCampaign';
import { useAnalytics } from '../../../hooks/useAnalytics';
import { ICampaign, CampaignType } from '../../../types/campaign';
import { UserRole } from '../../../types/auth';
import { AI_CONFIG } from '../../../lib/constants';

/**
 * Page component for creating new campaigns with AI-driven optimization
 */
const CreateCampaignPage: React.FC = () => {
  const router = useRouter();
  const { showNotification } = useNotification();
  const { hasPermission } = useRBAC();
  const { createCampaign, loading, error } = useCreateCampaign();
  const { trackEvent } = useAnalytics();

  // Check user permissions
  useEffect(() => {
    if (!hasPermission(UserRole.MANAGER)) {
      showNotification({
        type: 'error',
        message: 'Insufficient permissions to create campaigns'
      });
      router.push('/campaigns');
    }
  }, [hasPermission, router, showNotification]);

  /**
   * Handle campaign creation with AI optimization and analytics tracking
   */
  const handleCreateCampaign = useCallback(async (campaign: ICampaign) => {
    try {
      // Track campaign creation start
      trackEvent('campaign_creation_started', {
        campaignType: campaign.type,
        aiEnabled: campaign.config.optimization.enabled
      });

      // Configure AI model based on campaign type
      const aiConfig = {
        ...AI_CONFIG.LLM_SETTINGS,
        ...AI_CONFIG.MODEL_DEFAULTS[campaign.type],
        voice: campaign.type === CampaignType.OUTBOUND_CALL ? {
          ...AI_CONFIG.VOICE_SYNTHESIS,
          ...campaign.config.aiConfig?.voice
        } : undefined
      };

      // Create campaign with enhanced AI configuration
      const createdCampaign = await createCampaign({
        ...campaign,
        config: {
          ...campaign.config,
          aiConfig
        }
      });

      showNotification({
        type: 'success',
        message: 'Campaign created successfully'
      });

      // Track successful creation
      trackEvent('campaign_creation_completed', {
        campaignId: createdCampaign.id,
        campaignType: createdCampaign.type,
        aiConfig: createdCampaign.config.aiConfig
      });

      router.push(`/campaigns/${createdCampaign.id}`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create campaign';
      showNotification({
        type: 'error',
        message: errorMessage
      });

      // Track error
      trackEvent('campaign_creation_error', {
        error: errorMessage,
        campaignType: campaign.type
      });
    }
  }, [createCampaign, router, showNotification, trackEvent]);

  /**
   * Handle cancellation with cleanup
   */
  const handleCancel = useCallback(() => {
    trackEvent('campaign_creation_cancelled');
    router.push('/campaigns');
  }, [router, trackEvent]);

  // Available AI models based on campaign type
  const aiModels = [
    {
      id: 'gpt-4',
      name: 'GPT-4 (Advanced)',
      capabilities: ['Natural conversations', 'Complex reasoning', 'Multi-turn dialogue']
    },
    {
      id: 'claude-2',
      name: 'Claude 2 (Balanced)',
      capabilities: ['High accuracy', 'Consistent responses', 'Domain expertise']
    }
  ];

  // Voice synthesis options for outbound calls
  const voiceOptions = [
    { id: 'en-US-Neural1', name: 'Professional Male (US)', provider: 'AWS Polly' },
    { id: 'en-US-Neural2', name: 'Professional Female (US)', provider: 'AWS Polly' },
    { id: 'en-GB-Neural1', name: 'Professional Male (UK)', provider: 'AWS Polly' }
  ];

  if (error) {
    return (
      <div className="p-4 text-red-600">
        <h2>Error Creating Campaign</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="max-w-4xl mx-auto p-6">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold">Create New Campaign</h1>
        </div>

        <div className="bg-white rounded-lg shadow-md p-6">
          {loading ? (
            <div className="flex justify-center items-center h-64">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            </div>
          ) : (
            <CampaignForm
              onSubmit={handleCreateCampaign}
              onCancel={handleCancel}
              aiModels={aiModels}
              voiceOptions={voiceOptions}
            />
          )}
        </div>
      </div>
    </ErrorBoundary>
  );
};

export default CreateCampaignPage;