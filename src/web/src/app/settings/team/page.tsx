'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import { debounce } from 'lodash';
import TeamMemberList from '../../../components/settings/TeamMemberList';
import { useOrganization } from '../../../hooks/useOrganization';
import { useAuth } from '../../../hooks/useAuth';
import { Loading } from '../../../components/shared/Loading';
import { DESIGN_SYSTEM } from '../../../lib/constants';

/**
 * Error fallback component for team settings page
 */
const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => (
  <div className="p-6 bg-error-50 rounded-lg">
    <h3 className="text-lg font-semibold text-error-700 mb-2">Error loading team settings</h3>
    <p className="text-error-600 mb-4">{error.message}</p>
    <button
      onClick={resetErrorBoundary}
      className="px-4 py-2 bg-error-600 text-white rounded-md hover:bg-error-700 transition-colors"
    >
      Try again
    </button>
  </div>
);

/**
 * Team settings page component with real-time member management
 */
const TeamSettingsPage: React.FC = () => {
  // Organization hook with real-time capabilities
  const {
    organization,
    loading,
    error,
    operations: { validateChanges },
    syncStatus,
    permissions
  } = useOrganization({
    enableSync: true,
    syncInterval: 30000,
    validatePermissions: true
  });

  // Authentication hook for permission validation
  const { user, checkPermission } = useAuth();

  // Local state for error handling
  const [localError, setLocalError] = useState<string | null>(null);

  // Debounced error handler
  const handleError = useCallback(
    debounce((error: Error) => {
      setLocalError(error.message);
      console.error('Team settings error:', error);
    }, 300),
    []
  );

  // Handle member updates with validation
  const handleMemberUpdate = useCallback(async (member: any) => {
    try {
      if (!permissions.canManageMembers) {
        throw new Error('Insufficient permissions to manage team members');
      }

      if (!validateChanges({ members: { [member.id]: member } })) {
        throw new Error('Invalid member update');
      }

      // Clear any existing errors
      setLocalError(null);
    } catch (error) {
      handleError(error as Error);
    }
  }, [permissions.canManageMembers, validateChanges, handleError]);

  // Effect for handling organization errors
  useEffect(() => {
    if (error?.fetchMembers) {
      handleError(new Error(error.fetchMembers));
    }
  }, [error, handleError]);

  // Render loading state
  if (loading.fetchMembers) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Loading 
          size="lg"
          variant="primary"
          ariaLabel="Loading team members"
        />
      </div>
    );
  }

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => setLocalError(null)}
    >
      <div className="p-6 space-y-6">
        {/* Header section */}
        <div className="flex justify-between items-center pb-6 border-b border-gray-200">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Team Settings</h1>
            <p className="mt-1 text-sm text-gray-500">
              Manage your team members and their roles
            </p>
          </div>
          
          {/* Real-time sync status indicator */}
          <div className="flex items-center space-x-2">
            <span 
              className={`w-2 h-2 rounded-full ${
                syncStatus.connected ? 'bg-success-500' : 'bg-error-500'
              }`}
            />
            <span className="text-sm text-gray-500">
              {syncStatus.connected ? 'Connected' : 'Disconnected'}
            </span>
          </div>
        </div>

        {/* Error alert */}
        {localError && (
          <div 
            className="p-4 bg-error-50 border border-error-200 rounded-md"
            role="alert"
          >
            <p className="text-sm text-error-700">{localError}</p>
          </div>
        )}

        {/* Team member list */}
        {organization && (
          <TeamMemberList
            organizationId={organization.id}
            onMemberUpdate={handleMemberUpdate}
            onError={handleError}
            className="mt-6"
          />
        )}

        {/* Permissions notice */}
        {!permissions.canManageMembers && (
          <p className="text-sm text-gray-500 italic mt-4">
            Contact your organization administrator to make changes to team members
          </p>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default TeamSettingsPage;