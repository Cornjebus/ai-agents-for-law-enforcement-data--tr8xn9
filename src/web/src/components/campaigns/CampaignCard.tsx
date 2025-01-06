import React, { useCallback, useMemo } from 'react';
import clsx from 'clsx'; // v2.0+
import { useTranslation } from 'react-i18next'; // v13.0+
import { format } from 'date-fns'; // v2.0+
import { ICampaign, CampaignStatus } from '../../types/campaign';
import Card from '../shared/Card';
import Button from '../shared/Button';
import { DESIGN_SYSTEM } from '../../lib/constants';
import { useAnalytics } from '../../hooks/useAnalytics';

interface CampaignCardProps {
  campaign: ICampaign;
  onEdit: (id: string) => Promise<void>;
  onPause: (id: string) => Promise<void>;
  onResume: (id: string) => Promise<void>;
  className?: string;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}

/**
 * Enterprise-grade campaign card component with accessibility and i18n support
 */
const CampaignCard: React.FC<CampaignCardProps> = ({
  campaign,
  onEdit,
  onPause,
  onResume,
  className,
  isLoading = false,
  error = null,
  onRetry
}) => {
  const { t } = useTranslation('campaigns');
  const { trackEvent } = useAnalytics();

  // Memoized status styles based on design system
  const statusStyles = useMemo(() => ({
    [CampaignStatus.ACTIVE]: `text-[${DESIGN_SYSTEM.COLORS.success}] bg-green-50`,
    [CampaignStatus.PAUSED]: `text-[${DESIGN_SYSTEM.COLORS.warning}] bg-yellow-50`,
    [CampaignStatus.COMPLETED]: `text-[${DESIGN_SYSTEM.COLORS.secondary}] bg-blue-50`,
    [CampaignStatus.FAILED]: `text-[${DESIGN_SYSTEM.COLORS.error}] bg-red-50`,
    [CampaignStatus.DRAFT]: `text-[${DESIGN_SYSTEM.COLORS.gray[600]}] bg-gray-50`,
    [CampaignStatus.OPTIMIZING]: `text-[${DESIGN_SYSTEM.COLORS.primary}] bg-blue-50`
  }), []);

  // Handle campaign actions with analytics tracking
  const handleAction = useCallback(async (
    action: 'edit' | 'pause' | 'resume',
    id: string
  ) => {
    try {
      trackEvent({
        category: 'Campaign',
        action: `campaign_${action}`,
        label: id
      });

      switch (action) {
        case 'edit':
          await onEdit(id);
          break;
        case 'pause':
          await onPause(id);
          break;
        case 'resume':
          await onResume(id);
          break;
      }
    } catch (error) {
      console.error(`Campaign ${action} error:`, error);
      throw error;
    }
  }, [onEdit, onPause, onResume, trackEvent]);

  // Render campaign metrics with proper formatting
  const renderMetrics = useMemo(() => (
    <div className="grid grid-cols-3 gap-4 my-4" role="group" aria-label={t('metrics.group')}>
      <div>
        <p className="text-sm text-gray-500">{t('metrics.revenue')}</p>
        <p className="text-lg font-semibold">
          ${campaign.metrics.revenue.toLocaleString()}
        </p>
      </div>
      <div>
        <p className="text-sm text-gray-500">{t('metrics.conversions')}</p>
        <p className="text-lg font-semibold">
          {campaign.metrics.conversions.toLocaleString()}
          <span className="text-sm text-gray-500 ml-1">
            ({(campaign.metrics.conversionRate * 100).toFixed(1)}%)
          </span>
        </p>
      </div>
      <div>
        <p className="text-sm text-gray-500">{t('metrics.roas')}</p>
        <p className="text-lg font-semibold">
          {campaign.metrics.roas.toFixed(1)}x
        </p>
      </div>
    </div>
  ), [campaign.metrics, t]);

  return (
    <Card
      variant="default"
      padding="lg"
      className={clsx(
        'transition-all duration-200',
        error && 'border-red-300',
        className
      )}
      role="article"
      aria-labelledby={`campaign-${campaign.id}-title`}
      aria-busy={isLoading}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3
            id={`campaign-${campaign.id}-title`}
            className="text-lg font-semibold text-gray-900"
          >
            {campaign.name}
          </h3>
          <p className="text-sm text-gray-500">
            {t('created', {
              date: format(new Date(campaign.createdAt), 'PPP')
            })}
          </p>
        </div>
        <div
          className={clsx(
            'px-3 py-1 rounded-full text-sm font-medium',
            statusStyles[campaign.status]
          )}
          role="status"
        >
          {t(`status.${campaign.status.toLowerCase()}`)}
        </div>
      </div>

      {/* Error State */}
      {error && (
        <div
          className="bg-red-50 p-4 rounded-md mb-4"
          role="alert"
          aria-live="polite"
        >
          <p className="text-sm text-red-700">{error.message}</p>
          {onRetry && (
            <Button
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="mt-2"
            >
              {t('actions.retry')}
            </Button>
          )}
        </div>
      )}

      {/* Metrics */}
      {renderMetrics}

      {/* Actions */}
      <div className="flex justify-end space-x-2 mt-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => handleAction('edit', campaign.id)}
          isLoading={isLoading}
          aria-label={t('actions.edit')}
        >
          {t('actions.edit')}
        </Button>
        {campaign.status === CampaignStatus.ACTIVE ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAction('pause', campaign.id)}
            isLoading={isLoading}
            aria-label={t('actions.pause')}
          >
            {t('actions.pause')}
          </Button>
        ) : campaign.status === CampaignStatus.PAUSED ? (
          <Button
            variant="primary"
            size="sm"
            onClick={() => handleAction('resume', campaign.id)}
            isLoading={isLoading}
            aria-label={t('actions.resume')}
          >
            {t('actions.resume')}
          </Button>
        ) : null}
      </div>
    </Card>
  );
};

// Display name for debugging
CampaignCard.displayName = 'CampaignCard';

export default CampaignCard;