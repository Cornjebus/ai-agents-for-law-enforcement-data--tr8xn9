'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from 'next-i18next';
import { ErrorBoundary } from 'react-error-boundary';
import toast from 'react-hot-toast';

import { OrganizationForm } from '../../../components/settings/OrganizationForm';
import { Organization } from '../../../types/organization';
import { OrganizationService } from '../../../services/organization.service';
import Card from '../../../components/shared/Card';
import { DESIGN_SYSTEM } from '../../../lib/constants';
import { apiClient } from '../../../lib/api';

// Initialize organization service
const organizationService = new OrganizationService(apiClient, null as any);

/**
 * Server component function to fetch organization data
 */
async function getOrganizationData(): Promise<Organization> {
  try {
    const organization = await organizationService.getOrganization(
      process.env.NEXT_PUBLIC_ORGANIZATION_ID || ''
    );
    return organization;
  } catch (error) {
    console.error('Failed to fetch organization data:', error);
    throw error;
  }
}

/**
 * Error fallback component
 */
const ErrorFallback: React.FC<{ error: Error }> = ({ error }) => (
  <Card variant="outline" padding="lg" className="text-center">
    <h2 className={DESIGN_SYSTEM.TYPOGRAPHY.fontSize.xl}>Error Loading Settings</h2>
    <p className="text-gray-600 mt-2">{error.message}</p>
    <button
      onClick={() => window.location.reload()}
      className="mt-4 px-4 py-2 bg-primary text-white rounded-md"
    >
      Retry
    </button>
  </Card>
);

/**
 * Organization Settings Page Component
 */
export default function OrganizationPage() {
  const { t } = useTranslation('settings');
  const router = useRouter();
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Load organization data
  useEffect(() => {
    const loadOrganization = async () => {
      try {
        const data = await getOrganizationData();
        setOrganization(data);
      } catch (error) {
        toast.error(t('errors.loadFailed'));
      } finally {
        setIsLoading(false);
      }
    };

    loadOrganization();
  }, [t]);

  // Subscribe to real-time updates
  useEffect(() => {
    if (!organization?.id) return;

    const unsubscribe = organizationService.subscribeToUpdates(
      organization.id,
      (updatedOrg) => {
        setOrganization(updatedOrg);
        toast.success(t('notifications.settingsUpdated'));
      }
    );

    return () => unsubscribe();
  }, [organization?.id, t]);

  // Handle organization updates
  const handleOrganizationUpdate = useCallback(async (updatedData: Organization) => {
    try {
      if (!organization?.id) return;

      // Optimistic update
      setOrganization(updatedData);

      // Persist changes
      await organizationService.updateOrganization(organization.id, updatedData);
      toast.success(t('notifications.saveSuccess'));
    } catch (error) {
      // Revert optimistic update
      setOrganization(organization);
      toast.error(t('errors.saveFailed'));
    }
  }, [organization, t]);

  if (isLoading) {
    return (
      <Card padding="lg" className="animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-4" />
        <div className="space-y-3">
          <div className="h-4 bg-gray-200 rounded w-3/4" />
          <div className="h-4 bg-gray-200 rounded w-1/2" />
          <div className="h-4 bg-gray-200 rounded w-2/3" />
        </div>
      </Card>
    );
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div className="space-y-6">
        <header className="border-b border-gray-200 pb-4">
          <h1 className={DESIGN_SYSTEM.TYPOGRAPHY.fontSize['2xl']}>
            {t('organization.settings.title')}
          </h1>
          <p className="text-gray-600 mt-2">
            {t('organization.settings.description')}
          </p>
        </header>

        <Card variant="default" padding="lg">
          {organization && (
            <OrganizationForm
              organization={organization}
              onSubmit={handleOrganizationUpdate}
              className="space-y-6"
            />
          )}
        </Card>

        <div className="flex justify-end space-x-4">
          <button
            type="button"
            onClick={() => router.back()}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </ErrorBoundary>
  );
}