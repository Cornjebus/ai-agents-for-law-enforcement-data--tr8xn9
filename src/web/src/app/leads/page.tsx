'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import LeadList from '../../components/leads/LeadList';
import Button from '../../components/shared/Button';
import { useLeads } from '../../hooks/useLeads';
import { useAnalytics } from '../../hooks/useAnalytics';
import { hasPermission } from '../../lib/auth';
import { DESIGN_SYSTEM } from '../../lib/constants';
import { UserRole } from '../../types/auth';
import { LeadStatus, ILead } from '../../types/lead';

// Error Fallback component
const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => (
  <div className="p-6 bg-red-50 rounded-lg">
    <h3 className="text-lg font-semibold text-red-800">Something went wrong</h3>
    <p className="mt-2 text-red-600">{error.message}</p>
    <Button 
      variant="primary" 
      onClick={resetErrorBoundary}
      className="mt-4"
    >
      Try again
    </Button>
  </div>
);

// Lead page filters interface
interface LeadFilters {
  status?: LeadStatus[];
  scoreRange?: {
    min: number;
    max: number;
  };
  dateRange?: {
    start: Date;
    end: Date;
  };
}

const LeadsPage = () => {
  // State management
  const [viewType, setViewType] = useState<'table' | 'grid'>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('leadViewType') as 'table' | 'grid' || 'table';
    }
    return 'table';
  });
  
  const [filters, setFilters] = useState<LeadFilters>({});

  // Custom hooks
  const {
    leads,
    loading,
    error,
    batchOperations,
    realTimeStatus,
    updateLead,
    deleteLead,
    updateAIScore
  } = useLeads(filters);

  const { trackEvent } = useAnalytics();

  // Permission checks
  const canManageLeads = hasPermission(UserRole.MANAGER);
  const canUpdateScores = hasPermission(UserRole.ANALYST);

  // View type change handler
  const handleViewTypeChange = useCallback((type: 'table' | 'grid') => {
    setViewType(type);
    localStorage.setItem('leadViewType', type);
    trackEvent({
      category: 'Leads',
      action: 'ViewTypeChange',
      label: type
    });
  }, [trackEvent]);

  // Lead action handler
  const handleLeadAction = useCallback(async (actionType: string, lead: ILead) => {
    try {
      switch (actionType) {
        case 'delete':
          if (!canManageLeads) throw new Error('Insufficient permissions');
          await deleteLead(lead.id);
          break;
        case 'updateScore':
          if (!canUpdateScores) throw new Error('Insufficient permissions');
          await updateAIScore(lead.id);
          break;
        case 'update':
          if (!canManageLeads) throw new Error('Insufficient permissions');
          await updateLead(lead.id, { status: LeadStatus.QUALIFIED });
          break;
      }

      trackEvent({
        category: 'Leads',
        action: actionType,
        label: lead.id
      });
    } catch (err) {
      console.error(`Error performing ${actionType}:`, err);
      throw err;
    }
  }, [canManageLeads, canUpdateScores, deleteLead, updateAIScore, updateLead, trackEvent]);

  // Filter change handler
  const handleFilterChange = useCallback((newFilters: LeadFilters) => {
    setFilters(newFilters);
    trackEvent({
      category: 'Leads',
      action: 'FilterChange',
      label: JSON.stringify(newFilters)
    });
  }, [trackEvent]);

  // Real-time status effect
  useEffect(() => {
    if (realTimeStatus === 'CONNECTED') {
      trackEvent({
        category: 'Leads',
        action: 'RealTimeConnection',
        label: 'established'
      });
    }
  }, [realTimeStatus, trackEvent]);

  return (
    <ErrorBoundary
      FallbackComponent={ErrorFallback}
      onReset={() => window.location.reload()}
    >
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Lead Management</h1>
          <div className="flex space-x-4">
            {canManageLeads && (
              <Button
                variant="primary"
                onClick={() => {
                  trackEvent({
                    category: 'Leads',
                    action: 'AddLead',
                    label: 'button_click'
                  });
                }}
                startIcon={
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                }
              >
                Add Lead
              </Button>
            )}
          </div>
        </div>

        {/* Real-time indicator */}
        {realTimeStatus === 'CONNECTED' && (
          <div className="flex items-center text-green-600 text-sm mb-4">
            <span className="w-2 h-2 bg-green-600 rounded-full mr-2"></span>
            Real-time updates active
          </div>
        )}

        {/* Main content */}
        <LeadList
          viewType={viewType}
          onViewTypeChange={handleViewTypeChange}
          className="mt-4"
          pageSize={25}
          filters={filters}
          sortConfig={{
            key: 'createdAt',
            direction: 'desc'
          }}
          onFilterChange={handleFilterChange}
          onSortChange={(sortConfig) => {
            trackEvent({
              category: 'Leads',
              action: 'Sort',
              label: `${sortConfig.key}_${sortConfig.direction}`
            });
          }}
        />

        {/* Batch operations */}
        {canManageLeads && batchOperations.selectedLeads.size > 0 && (
          <div className="fixed bottom-0 left-0 right-0 bg-white border-t shadow-lg p-4">
            <div className="max-w-7xl mx-auto flex justify-between items-center">
              <span className="text-sm text-gray-600">
                {batchOperations.selectedLeads.size} leads selected
              </span>
              <div className="flex space-x-4">
                <Button
                  variant="outline"
                  onClick={() => batchOperations.deselectAll()}
                >
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  onClick={() => {
                    trackEvent({
                      category: 'Leads',
                      action: 'BatchUpdate',
                      label: 'selected_leads',
                      value: batchOperations.selectedLeads.size
                    });
                  }}
                >
                  Update Selected
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default LeadsPage;