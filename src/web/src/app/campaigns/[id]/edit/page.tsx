'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation'; // v13.4.0
import { toast } from 'react-hot-toast'; // v2.4.1
import { useDebounce } from 'use-debounce'; // v9.0.0

import CampaignForm from '../../../../components/campaigns/CampaignForm';
import Loading from '../../../../components/shared/Loading';
import { useCampaign } from '../../../../hooks/useCampaign';
import { useAuth } from '../../../../hooks/useAuth';
import { ICampaign } from '../../../../types/campaign';

// Error messages for user feedback
const ERROR_MESSAGES = {
  FETCH_ERROR: 'Failed to fetch campaign details. Please try again.',
  UPDATE_ERROR: 'Failed to update campaign. Please check your changes and try again.',
  PERMISSION_ERROR: "You don't have permission to edit this campaign.",
  OPTIMIZATION_ERROR: 'Failed to optimize campaign settings.',
  SUCCESS_MESSAGE: 'Campaign updated and optimized successfully'
} as const;

// AI optimization configuration
const OPTIMIZATION_CONFIG = {
  RETRY_ATTEMPTS: 3,
  DEBOUNCE_DELAY: 500,
  MIN_CONFIDENCE_SCORE: 0.85
} as const;

/**
 * Enhanced campaign edit page with AI-driven optimization
 */
const CampaignEditPage: React.FC = () => {
  // Hooks initialization
  const params = useParams();
  const router = useRouter();
  const { checkPermission } = useAuth();
  const [optimizationInProgress, setOptimizationInProgress] = useState(false);
  
  // Campaign management hooks with AI optimization
  const {
    campaign,
    loading,
    error,
    metrics,
    optimization,
    actions: { refresh, optimize, updateMetrics }
  } = useCampaign(params.id as string);

  // Debounced optimization to prevent excessive API calls
  const [debouncedOptimize] = useDebounce(optimize, OPTIMIZATION_CONFIG.DEBOUNCE_DELAY);

  /**
   * Permission check and initial data fetch
   */
  useEffect(() => {
    const initializePage = async () => {
      if (!checkPermission('campaign.edit')) {
        toast.error(ERROR_MESSAGES.PERMISSION_ERROR);
        router.push('/campaigns');
        return;
      }

      await refresh();
    };

    initializePage();
  }, [params.id, checkPermission, refresh, router]);

  /**
   * Enhanced form submission handler with AI optimization
   */
  const handleSubmit = async (updatedCampaign: ICampaign) => {
    try {
      setOptimizationInProgress(true);

      // Trigger AI optimization
      await debouncedOptimize();

      // Validate optimization results
      if (optimization.score < OPTIMIZATION_CONFIG.MIN_CONFIDENCE_SCORE) {
        throw new Error(ERROR_MESSAGES.OPTIMIZATION_ERROR);
      }

      // Update campaign with optimized settings
      await updateMetrics({
        ...metrics,
        aiMetrics: {
          ...metrics?.aiMetrics,
          optimizationScore: optimization.score,
          lastOptimizedAt: new Date()
        }
      });

      toast.success(ERROR_MESSAGES.SUCCESS_MESSAGE);
      router.push(`/campaigns/${params.id}`);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : ERROR_MESSAGES.UPDATE_ERROR);
    } finally {
      setOptimizationInProgress(false);
    }
  };

  /**
   * Handle cancellation and navigation
   */
  const handleCancel = () => {
    router.push(`/campaigns/${params.id}`);
  };

  // Loading state with accessibility support
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loading 
          size="lg"
          variant="primary"
          ariaLabel="Loading campaign details"
        />
      </div>
    );
  }

  // Error state with retry option
  if (error || !campaign) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen">
        <p className="text-error-600 mb-4">{error || ERROR_MESSAGES.FETCH_ERROR}</p>
        <button
          onClick={refresh}
          className="btn-primary"
          aria-label="Retry loading campaign"
        >
          Retry
        </button>
      </div>
    );
  }

  // Main form render with AI optimization support
  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-semibold mb-6">
          Edit Campaign: {campaign.name}
        </h1>

        <CampaignForm
          campaign={campaign}
          onSubmit={handleSubmit}
          onCancel={handleCancel}
          aiModels={[
            {
              id: 'gpt-4',
              name: 'GPT-4 (Recommended)',
              capabilities: ['Advanced optimization', 'Multi-modal support']
            },
            {
              id: 'claude',
              name: 'Claude',
              capabilities: ['High accuracy', 'Context awareness']
            }
          ]}
          voiceOptions={[
            { id: 'en-US-Neural1', name: 'Professional Male (US)', provider: 'AWS Polly' },
            { id: 'en-US-Neural2', name: 'Professional Female (US)', provider: 'AWS Polly' },
            { id: 'en-GB-Neural1', name: 'Professional Male (UK)', provider: 'AWS Polly' }
          ]}
        />

        {optimizationInProgress && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white p-6 rounded-lg shadow-xl">
              <Loading size="md" variant="primary" />
              <p className="mt-4 text-center">
                Optimizing campaign settings...
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default CampaignEditPage;