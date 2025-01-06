'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import clsx from 'clsx'; // v2.0.0
import IntegrationCard from '../../../components/settings/IntegrationCard';
import { useOrganization } from '../../../hooks/useOrganization';
import { hasPermission } from '../../../lib/auth';
import { UserRole } from '../../../types/auth';
import { DESIGN_SYSTEM } from '../../../lib/constants';

// Integration configuration with health monitoring
const INTEGRATIONS_CONFIG = {
  crm: [
    {
      name: 'Salesforce',
      type: 'crm',
      icon: '/icons/salesforce.svg',
      description: 'Enterprise CRM integration with real-time sync',
      healthStatus: 'healthy',
      lastChecked: new Date(),
      retryCount: 0,
      config: {
        apiVersion: '54.0',
        environment: 'production'
      }
    },
    {
      name: 'HubSpot',
      type: 'crm',
      icon: '/icons/hubspot.svg',
      description: 'Marketing automation and CRM platform',
      healthStatus: 'healthy',
      lastChecked: new Date(),
      retryCount: 0,
      config: {
        scopes: ['contacts', 'deals', 'companies']
      }
    }
  ],
  social: [
    {
      name: 'LinkedIn',
      type: 'social',
      icon: '/icons/linkedin.svg',
      description: 'Professional network integration',
      healthStatus: 'healthy',
      lastChecked: new Date(),
      retryCount: 0,
      config: {
        apiVersion: '2.0',
        permissions: ['r_organization', 'w_organization']
      }
    },
    {
      name: 'TikTok',
      type: 'social',
      icon: '/icons/tiktok.svg',
      description: 'Short-form video platform integration',
      healthStatus: 'healthy',
      lastChecked: new Date(),
      retryCount: 0,
      config: {
        apiVersion: '2.0',
        features: ['content_posting', 'analytics']
      }
    }
  ],
  payment: [
    {
      name: 'Stripe',
      type: 'payment',
      icon: '/icons/stripe.svg',
      description: 'Payment processing integration',
      healthStatus: 'healthy',
      lastChecked: new Date(),
      retryCount: 0,
      config: {
        apiVersion: '2023-10-16',
        features: ['payments', 'subscriptions']
      }
    }
  ],
  voice: [
    {
      name: 'Amazon Polly',
      type: 'voice',
      icon: '/icons/aws.svg',
      description: 'Text-to-speech voice synthesis',
      healthStatus: 'healthy',
      lastChecked: new Date(),
      retryCount: 0,
      config: {
        region: 'us-west-2',
        engine: 'neural'
      }
    }
  ]
};

/**
 * Enhanced integrations page component with real-time monitoring
 */
const IntegrationsPage: React.FC = () => {
  const router = useRouter();
  const { organization, operations, permissions, syncStatus } = useOrganization({
    enableSync: true,
    syncInterval: 30000
  });

  const [healthStatus, setHealthStatus] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Verify user has permission to manage integrations
  useEffect(() => {
    if (!hasPermission(UserRole.MANAGER)) {
      router.push('/dashboard');
      return;
    }
  }, [router]);

  // Set up real-time health monitoring
  useEffect(() => {
    const healthCheck = async () => {
      const newStatus: Record<string, string> = {};
      
      for (const category in INTEGRATIONS_CONFIG) {
        for (const integration of INTEGRATIONS_CONFIG[category]) {
          try {
            const status = organization?.settings?.integrations?.[integration.type]?.[integration.name]?.status;
            newStatus[`${integration.type}-${integration.name}`] = status || 'disconnected';
          } catch (error) {
            console.error(`Health check failed for ${integration.name}:`, error);
            newStatus[`${integration.type}-${integration.name}`] = 'error';
          }
        }
      }
      
      setHealthStatus(newStatus);
    };

    const intervalId = setInterval(healthCheck, 60000); // Check every minute
    healthCheck(); // Initial check

    return () => clearInterval(intervalId);
  }, [organization]);

  // Handle integration connection changes with retry mechanism
  const handleConnectionChange = useCallback(async (
    integrationType: string,
    integrationName: string,
    connected: boolean
  ) => {
    if (!permissions.canEdit) {
      setError('Insufficient permissions to modify integrations');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Optimistic update
      setHealthStatus(prev => ({
        ...prev,
        [`${integrationType}-${integrationName}`]: connected ? 'connecting' : 'disconnecting'
      }));

      await operations.updateSettings({
        ...organization.settings,
        integrations: {
          ...organization.settings.integrations,
          [integrationType]: {
            ...organization.settings.integrations?.[integrationType],
            [integrationName]: {
              enabled: connected,
              lastChecked: new Date(),
              status: connected ? 'connected' : 'disconnected'
            }
          }
        }
      });

      setHealthStatus(prev => ({
        ...prev,
        [`${integrationType}-${integrationName}`]: connected ? 'connected' : 'disconnected'
      }));
    } catch (error) {
      console.error('Integration update failed:', error);
      setError(`Failed to ${connected ? 'connect' : 'disconnect'} ${integrationName}`);
      
      setHealthStatus(prev => ({
        ...prev,
        [`${integrationType}-${integrationName}`]: 'error'
      }));
    } finally {
      setLoading(false);
    }
  }, [organization, operations, permissions]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-gray-900">
          Service Integrations
        </h1>
        <p className="mt-2 text-sm text-gray-600">
          Manage your third-party service connections and monitor their health status
        </p>
      </div>

      {/* Error display */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200">
          <p className="text-sm text-red-600">{error}</p>
        </div>
      )}

      {/* Sync status indicator */}
      <div className="mb-6 flex items-center space-x-2">
        <div className={clsx(
          'w-2 h-2 rounded-full',
          syncStatus.connected ? 'bg-green-500' : 'bg-red-500'
        )} />
        <span className="text-sm text-gray-600">
          {syncStatus.connected ? 'Connected' : 'Disconnected'}
        </span>
      </div>

      {/* Integration sections */}
      <div className="space-y-8">
        {Object.entries(INTEGRATIONS_CONFIG).map(([category, integrations]) => (
          <section key={category} className="space-y-4">
            <h2 className="text-lg font-medium text-gray-900 capitalize">
              {category} Integrations
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {integrations.map((integration) => (
                <IntegrationCard
                  key={`${integration.type}-${integration.name}`}
                  integrationType={integration.type}
                  name={integration.name}
                  description={integration.description}
                  icon={integration.icon}
                  isConnected={healthStatus[`${integration.type}-${integration.name}`] === 'connected'}
                  organizationId={organization?.id || ''}
                  config={integration.config}
                  onConnectionChange={(connected) => 
                    handleConnectionChange(integration.type, integration.name, connected)
                  }
                  className="h-full"
                  retryAttempts={3}
                  retryDelay={1000}
                  statusUpdateInterval={30000}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default IntegrationsPage;