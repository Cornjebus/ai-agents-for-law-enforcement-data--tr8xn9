import React, { useState, useCallback } from 'react';
import { useRouter } from 'next/router'; // v13.0.0
import { useTranslation } from 'react-i18next'; // v12.0.0
import { useHotkeys } from 'react-hotkeys-hook'; // v4.0.0
import { ErrorBoundary } from 'react-error-boundary'; // v4.0.11
import { Tooltip } from '@radix-ui/react-tooltip'; // v1.0.0
import { usePermissions } from '@auth/permissions'; // v1.0.0

import Button from '../shared/Button';
import { useCreateCampaign } from '../../hooks/useCampaign';
import { useContent } from '../../hooks/useContent';
import { useVoice } from '../../hooks/useVoice';
import { useAnalytics } from '../../hooks/useAnalytics';

/**
 * QuickActions component providing quick access buttons for primary actions
 * with enhanced features like keyboard shortcuts, analytics, and error handling
 */
const QuickActions: React.FC = () => {
  const router = useRouter();
  const { t } = useTranslation();
  const { hasPermission } = usePermissions();
  const { trackEvent } = useAnalytics();
  
  // State management
  const [error, setError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // Custom hooks for actions
  const { createCampaign, loading: campaignLoading } = useCreateCampaign();
  const { generateContent, isLoading: contentLoading } = useContent();
  const { initiateCall, isLoading: callLoading } = useVoice();

  /**
   * Handle campaign creation with error handling and analytics
   */
  const handleCreateCampaign = useCallback(async () => {
    try {
      if (!hasPermission('campaign.create')) {
        throw new Error('Insufficient permissions');
      }

      trackEvent({
        category: 'QuickActions',
        action: 'create_campaign',
        label: 'dashboard'
      });

      const campaign = await createCampaign({
        name: 'New Campaign',
        type: 'OUTBOUND_CALL',
        status: 'DRAFT'
      });

      router.push(`/campaigns/${campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create campaign');
      setRetryCount(prev => prev + 1);
    }
  }, [createCampaign, hasPermission, router, trackEvent]);

  /**
   * Handle content generation with error handling and analytics
   */
  const handleGenerateContent = useCallback(async () => {
    try {
      if (!hasPermission('content.create')) {
        throw new Error('Insufficient permissions');
      }

      trackEvent({
        category: 'QuickActions',
        action: 'generate_content',
        label: 'dashboard'
      });

      const content = await generateContent({
        type: 'TEXT',
        platform: 'SOCIAL_MEDIA',
        metadata: {
          aiModel: 'gpt-4',
          generationPrompt: 'Create engaging social media content'
        }
      });

      router.push(`/content/${content.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate content');
      setRetryCount(prev => prev + 1);
    }
  }, [generateContent, hasPermission, router, trackEvent]);

  /**
   * Handle call initiation with error handling and analytics
   */
  const handleInitiateCall = useCallback(async () => {
    try {
      if (!hasPermission('call.initiate')) {
        throw new Error('Insufficient permissions');
      }

      trackEvent({
        category: 'QuickActions',
        action: 'initiate_call',
        label: 'dashboard'
      });

      const call = await initiateCall('+1234567890', 'test-campaign', {
        engine: 'NEURAL_HD',
        quality: 'HIGH'
      });

      router.push(`/calls/${call.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initiate call');
      setRetryCount(prev => prev + 1);
    }
  }, [initiateCall, hasPermission, router, trackEvent]);

  // Keyboard shortcuts
  useHotkeys('alt+c', handleCreateCampaign, [handleCreateCampaign]);
  useHotkeys('alt+g', handleGenerateContent, [handleGenerateContent]);
  useHotkeys('alt+v', handleInitiateCall, [handleInitiateCall]);

  return (
    <ErrorBoundary
      fallback={<div className="text-red-500">Something went wrong</div>}
      onReset={() => setError(null)}
    >
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4">
        <Tooltip content={t('Create new campaign (Alt+C)')}>
          <Button
            variant="primary"
            size="lg"
            isLoading={campaignLoading}
            isDisabled={!hasPermission('campaign.create')}
            onClick={handleCreateCampaign}
            className="w-full transition-all duration-200 hover:scale-105"
            startIcon={<span className="material-icons">add_circle</span>}
          >
            {t('Create Campaign')}
          </Button>
        </Tooltip>

        <Tooltip content={t('Generate new content (Alt+G)')}>
          <Button
            variant="primary"
            size="lg"
            isLoading={contentLoading}
            isDisabled={!hasPermission('content.create')}
            onClick={handleGenerateContent}
            className="w-full transition-all duration-200 hover:scale-105"
            startIcon={<span className="material-icons">auto_awesome</span>}
          >
            {t('Generate Content')}
          </Button>
        </Tooltip>

        <Tooltip content={t('Start new call (Alt+V)')}>
          <Button
            variant="primary"
            size="lg"
            isLoading={callLoading}
            isDisabled={!hasPermission('call.initiate')}
            onClick={handleInitiateCall}
            className="w-full transition-all duration-200 hover:scale-105"
            startIcon={<span className="material-icons">call</span>}
          >
            {t('Start Call')}
          </Button>
        </Tooltip>

        {error && (
          <div className="col-span-full">
            <div className="bg-red-50 border border-red-200 rounded p-4 mt-4">
              <p className="text-red-600">{error}</p>
              {retryCount < 3 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setError(null)}
                  className="mt-2"
                >
                  {t('Retry')}
                </Button>
              )}
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default QuickActions;