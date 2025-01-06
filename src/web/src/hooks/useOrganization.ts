/**
 * @fileoverview Enhanced React hook for managing organization state with real-time sync,
 * optimistic updates, role-based validation, and comprehensive error handling
 * @version 1.0.0
 */

import { useSelector, useDispatch } from 'react-redux';
import { useCallback, useEffect } from 'react';
import { Organization, OrganizationSettings } from '../types/organization';
import { organizationSlice } from '../store/organizationSlice';
import { hasPermission } from '../lib/auth';
import { UserRole } from '../types/auth';

/**
 * Enhanced sync status interface for real-time updates
 */
interface SyncStatus {
  lastSync: number;
  connected: boolean;
  pendingChanges: boolean;
}

/**
 * Enhanced permission status interface
 */
interface PermissionStatus {
  canView: boolean;
  canEdit: boolean;
  canManageMembers: boolean;
  canConfigureAI: boolean;
}

/**
 * Enhanced organization operations interface
 */
interface OrganizationOperations {
  updateSettings: (settings: OrganizationSettings) => Promise<void>;
  updateAIConfig: (aiConfig: Organization['aiConfig']) => Promise<void>;
  syncNow: () => Promise<void>;
  validateChanges: (changes: Partial<Organization>) => boolean;
}

/**
 * Hook configuration options interface
 */
interface UseOrganizationOptions {
  enableSync?: boolean;
  syncInterval?: number;
  validatePermissions?: boolean;
}

/**
 * Enhanced hook return type with comprehensive state and operations
 */
interface UseOrganizationReturn {
  organization: Organization | null;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  syncStatus: SyncStatus;
  permissions: PermissionStatus;
  operations: OrganizationOperations;
}

/**
 * Enhanced React hook for managing organization state with real-time capabilities
 */
export function useOrganization(
  options: UseOrganizationOptions = {}
): UseOrganizationReturn {
  const {
    enableSync = true,
    syncInterval = 30000,
    validatePermissions = true
  } = options;

  const dispatch = useDispatch();

  // Enhanced selectors with memoization
  const organization = useSelector((state: any) => state.organization.organization);
  const loading = useSelector((state: any) => state.organization.loading);
  const error = useSelector((state: any) => state.organization.error);
  const syncStatus = useSelector((state: any) => state.organization.syncStatus);

  // Initialize permission status
  const permissions: PermissionStatus = {
    canView: hasPermission(UserRole.ANALYST),
    canEdit: hasPermission(UserRole.MANAGER),
    canManageMembers: hasPermission(UserRole.MANAGER),
    canConfigureAI: hasPermission(UserRole.ADMIN)
  };

  // Enhanced validation function
  const validateChanges = useCallback((changes: Partial<Organization>): boolean => {
    if (!permissions.canEdit) return false;

    // Validate AI configuration changes
    if (changes.aiConfig && !permissions.canConfigureAI) {
      return false;
    }

    return true;
  }, [permissions]);

  // Enhanced update settings operation with optimistic updates
  const updateSettings = useCallback(async (settings: OrganizationSettings) => {
    if (!validateChanges({ settings })) {
      throw new Error('Insufficient permissions to update settings');
    }

    try {
      // Optimistic update
      dispatch(organizationSlice.actions.optimisticUpdateSettings(settings));

      // Actual update
      await dispatch(organizationSlice.actions.updateOrganizationSettings({
        organizationId: organization?.id,
        settings
      }));
    } catch (error) {
      // Revert optimistic update on failure
      if (organization) {
        dispatch(organizationSlice.actions.setOrganization(organization));
      }
      throw error;
    }
  }, [dispatch, organization, validateChanges]);

  // Enhanced update AI config operation with optimistic updates
  const updateAIConfig = useCallback(async (aiConfig: Organization['aiConfig']) => {
    if (!validateChanges({ aiConfig })) {
      throw new Error('Insufficient permissions to update AI configuration');
    }

    try {
      // Optimistic update
      dispatch(organizationSlice.actions.optimisticUpdateAIConfig(aiConfig));

      // Actual update
      await dispatch(organizationSlice.actions.updateOrganizationAIConfig({
        organizationId: organization?.id,
        aiConfig
      }));
    } catch (error) {
      // Revert optimistic update on failure
      if (organization) {
        dispatch(organizationSlice.actions.setOrganization(organization));
      }
      throw error;
    }
  }, [dispatch, organization, validateChanges]);

  // Enhanced sync operation
  const syncNow = useCallback(async () => {
    if (!organization?.id) return;

    try {
      await dispatch(organizationSlice.actions.fetchOrganization(organization.id));
      dispatch(organizationSlice.actions.updateSyncStatus({
        lastSync: Date.now(),
        connected: true,
        pendingChanges: false
      }));
    } catch (error) {
      dispatch(organizationSlice.actions.updateSyncStatus({
        connected: false,
        pendingChanges: true
      }));
      throw error;
    }
  }, [dispatch, organization?.id]);

  // Setup real-time sync
  useEffect(() => {
    if (!enableSync || !organization?.id) return;

    const syncInterval = setInterval(syncNow, syncInterval);

    // Initial sync
    syncNow();

    return () => {
      clearInterval(syncInterval);
    };
  }, [enableSync, syncInterval, organization?.id, syncNow]);

  return {
    organization,
    loading,
    error,
    syncStatus: {
      ...syncStatus,
      pendingChanges: false
    },
    permissions,
    operations: {
      updateSettings,
      updateAIConfig,
      syncNow,
      validateChanges
    }
  };
}