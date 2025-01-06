import React, { useState, useCallback, useEffect } from 'react';
import clsx from 'clsx'; // v2.0+
import { PulseLoader } from 'react-spinners'; // v0.13+
import { withErrorBoundary } from 'react-error-boundary'; // v4.0+
import Card from '../shared/Card';
import Button from '../shared/Button';
import { Organization } from '../../types/organization';
import { OrganizationService } from '../../services/organization.service';
import { DESIGN_SYSTEM } from '../../lib/constants';

/**
 * Props interface for the IntegrationCard component
 */
interface IntegrationCardProps {
  /** Type of integration service */
  integrationType: 'crm' | 'social' | 'payment' | 'voice';
  /** Display name of the integration */
  name: string;
  /** Description of the integration service */
  description: string;
  /** URL of the integration icon */
  icon: string;
  /** Current connection status */
  isConnected: boolean;
  /** Organization ID for the integration */
  organizationId: string;
  /** Integration-specific configuration */
  config: Record<string, any>;
  /** Callback for connection state changes */
  onConnectionChange: (connected: boolean, error?: Error) => void;
  /** Optional additional class names */
  className?: string;
  /** Number of retry attempts for failed operations */
  retryAttempts?: number;
  /** Delay between retry attempts in milliseconds */
  retryDelay?: number;
  /** Interval for status updates in milliseconds */
  statusUpdateInterval?: number;
}

/**
 * Integration status type definition
 */
type IntegrationStatus = 'connected' | 'disconnected' | 'error' | 'connecting';

/**
 * A reusable card component for managing third-party service integrations
 * Implements real-time status updates, error handling, and accessibility features
 */
const IntegrationCard: React.FC<IntegrationCardProps> = ({
  integrationType,
  name,
  description,
  icon,
  isConnected: initialConnected,
  organizationId,
  config,
  onConnectionChange,
  className = '',
  retryAttempts = 3,
  retryDelay = 1000,
  statusUpdateInterval = 30000
}) => {
  // State management
  const [isConnected, setIsConnected] = useState<boolean>(initialConnected);
  const [status, setStatus] = useState<IntegrationStatus>(initialConnected ? 'connected' : 'disconnected');
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Organization service instance
  const organizationService = new OrganizationService(null, null);

  /**
   * Handles the integration connection process with retry logic
   */
  const handleConnect = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    let attempts = 0;

    const attemptConnection = async (): Promise<void> => {
      try {
        setStatus('connecting');

        // Update organization settings with new integration
        await organizationService.updateSettings(organizationId, {
          ...config,
          integrations: {
            [integrationType]: {
              enabled: true,
              config: config
            }
          }
        });

        // Subscribe to real-time status updates
        const unsubscribe = organizationService.subscribeToUpdates(
          organizationId,
          (org: Organization) => {
            const integrationStatus = org.settings?.integrations?.[integrationType]?.enabled;
            setIsConnected(integrationStatus || false);
            setStatus(integrationStatus ? 'connected' : 'disconnected');
          }
        );

        setIsConnected(true);
        setStatus('connected');
        onConnectionChange(true);

        return () => unsubscribe();
      } catch (error) {
        attempts++;
        if (attempts < retryAttempts) {
          await new Promise(resolve => setTimeout(resolve, retryDelay));
          return attemptConnection();
        }
        throw error;
      }
    };

    try {
      await attemptConnection();
    } catch (error) {
      setError(error.message);
      setStatus('error');
      onConnectionChange(false, error);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, integrationType, config, onConnectionChange, retryAttempts, retryDelay]);

  /**
   * Handles the integration disconnection process
   */
  const handleDisconnect = useCallback(async () => {
    if (!window.confirm(`Are you sure you want to disconnect ${name}?`)) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Update organization settings to remove integration
      await organizationService.updateSettings(organizationId, {
        ...config,
        integrations: {
          [integrationType]: {
            enabled: false,
            config: {}
          }
        }
      });

      setIsConnected(false);
      setStatus('disconnected');
      onConnectionChange(false);
    } catch (error) {
      setError(error.message);
      setStatus('error');
      onConnectionChange(false, error);
    } finally {
      setIsLoading(false);
    }
  }, [organizationId, integrationType, name, config, onConnectionChange]);

  // Set up periodic status checks
  useEffect(() => {
    if (!isConnected) return;

    const checkStatus = async () => {
      try {
        const org = await organizationService.getOrganization(organizationId);
        const integrationStatus = org.settings?.integrations?.[integrationType]?.enabled;
        
        if (integrationStatus !== isConnected) {
          setIsConnected(integrationStatus);
          setStatus(integrationStatus ? 'connected' : 'disconnected');
          onConnectionChange(integrationStatus);
        }
      } catch (error) {
        console.error('Failed to check integration status:', error);
      }
    };

    const intervalId = setInterval(checkStatus, statusUpdateInterval);
    return () => clearInterval(intervalId);
  }, [organizationId, integrationType, isConnected, statusUpdateInterval, onConnectionChange]);

  return (
    <Card
      variant="outline"
      className={clsx(
        'transition-all duration-200',
        isConnected && 'border-green-200 bg-green-50',
        error && 'border-red-200 bg-red-50',
        className
      )}
      role="region"
      aria-label={`${name} integration`}
    >
      <div className="flex flex-col p-4 h-full">
        {/* Header */}
        <div className="flex items-center space-x-3 mb-4">
          <img
            src={icon}
            alt={`${name} icon`}
            className="w-10 h-10 rounded-lg bg-gray-100 p-2"
          />
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{name}</h3>
            <p className="text-sm text-gray-500">{description}</p>
          </div>
        </div>

        {/* Status indicator */}
        <div className="flex items-center space-x-2 mb-4">
          <div
            className={clsx(
              'w-2 h-2 rounded-full',
              status === 'connected' && 'bg-green-500',
              status === 'disconnected' && 'bg-gray-400',
              status === 'error' && 'bg-red-500',
              status === 'connecting' && 'bg-yellow-500 animate-pulse'
            )}
          />
          <span className="text-sm text-gray-600">
            {status.charAt(0).toUpperCase() + status.slice(1)}
          </span>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-2 rounded bg-red-100 border border-red-200">
            <p className="text-sm text-red-600">{error}</p>
          </div>
        )}

        {/* Actions */}
        <div className="mt-auto flex justify-end space-x-2">
          {isConnected ? (
            <Button
              variant="outline"
              size="sm"
              onClick={handleDisconnect}
              isLoading={isLoading}
              isDisabled={isLoading}
              aria-label={`Disconnect ${name}`}
            >
              Disconnect
            </Button>
          ) : (
            <Button
              variant="primary"
              size="sm"
              onClick={handleConnect}
              isLoading={isLoading}
              isDisabled={isLoading}
              aria-label={`Connect ${name}`}
            >
              {isLoading ? (
                <PulseLoader size={8} color={DESIGN_SYSTEM.COLORS.white} />
              ) : (
                'Connect'
              )}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
};

// Wrap component with error boundary
const IntegrationCardWithErrorBoundary = withErrorBoundary(IntegrationCard, {
  fallback: ({ error }) => (
    <Card variant="outline" className="border-red-200 bg-red-50">
      <div className="p-4">
        <h3 className="text-lg font-semibold text-red-600">Integration Error</h3>
        <p className="text-sm text-red-500">{error.message}</p>
      </div>
    </Card>
  )
});

export default IntegrationCardWithErrorBoundary;