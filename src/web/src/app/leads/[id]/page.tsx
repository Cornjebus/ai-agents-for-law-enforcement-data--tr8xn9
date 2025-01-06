'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { ErrorBoundary } from 'react-error-boundary';
import { useLeads } from '../../../hooks/useLeads';
import { useAuth } from '../../../hooks/useAuth';
import { ILead, LeadStatus } from '../../../types/lead';
import { DESIGN_SYSTEM } from '../../../lib/constants';

// Performance monitoring configuration
const PERFORMANCE_CONFIG = {
  RESPONSE_THRESHOLD: 200, // ms
  UPDATE_INTERVAL: 30000, // 30 seconds
  RETRY_ATTEMPTS: 3
};

interface LeadPageParams {
  id: string;
}

interface LeadPageProps {
  initialData?: ILead | null;
}

/**
 * Error fallback component for error boundary
 */
const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => (
  <div className="p-4 bg-red-50 border border-red-200 rounded-md">
    <h3 className="text-lg font-semibold text-red-700">Error Loading Lead</h3>
    <p className="text-red-600 mt-2">{error.message}</p>
    <button
      onClick={resetErrorBoundary}
      className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
    >
      Retry
    </button>
  </div>
);

/**
 * Lead details page component with real-time updates
 */
const LeadPage: React.FC<LeadPageProps> = ({ initialData }) => {
  const params = useParams() as LeadPageParams;
  const { hasPermission } = useAuth();
  const {
    selectedLead,
    selectLead,
    updateLead,
    updateAIScore,
    addLeadInteraction,
    subscribeToLeadUpdates
  } = useLeads();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState({
    loadTime: 0,
    updateCount: 0,
    lastUpdate: null as Date | null
  });

  /**
   * Handles lead data loading with performance monitoring
   */
  const loadLeadData = useCallback(async () => {
    const startTime = performance.now();
    try {
      setLoading(true);
      setError(null);

      // Select lead and monitor performance
      await selectLead({ id: params.id } as ILead);
      
      const loadTime = performance.now() - startTime;
      setPerformanceMetrics(prev => ({
        ...prev,
        loadTime,
        lastUpdate: new Date()
      }));

      // Emit performance metric for monitoring
      if (loadTime > PERFORMANCE_CONFIG.RESPONSE_THRESHOLD) {
        window.dispatchEvent(new CustomEvent('lead-load-performance', {
          detail: { loadTime, leadId: params.id }
        }));
      }
    } catch (err) {
      setError(err.message);
      console.error('Error loading lead:', err);
    } finally {
      setLoading(false);
    }
  }, [params.id, selectLead]);

  /**
   * Handles initiating a call with the lead
   */
  const handleCallClick = async () => {
    if (!selectedLead || !hasPermission('MANAGER')) return;

    try {
      // Record call interaction
      await addLeadInteraction({
        leadId: selectedLead.id,
        type: 'CALL',
        timestamp: new Date(),
        channel: 'VOICE',
        metadata: {
          initiatedBy: 'USER',
          callType: 'OUTBOUND'
        }
      });

      // Update lead status
      await updateLead(selectedLead.id, {
        status: LeadStatus.CONTACTED,
        lastContactedAt: new Date()
      });
    } catch (err) {
      setError('Failed to initiate call: ' + err.message);
    }
  };

  /**
   * Handles updating lead score
   */
  const handleUpdateScore = async () => {
    if (!selectedLead || !hasPermission('ANALYST')) return;

    try {
      await updateAIScore(selectedLead.id);
    } catch (err) {
      setError('Failed to update score: ' + err.message);
    }
  };

  /**
   * Set up real-time updates subscription
   */
  useEffect(() => {
    if (!params.id) return;

    const subscription = subscribeToLeadUpdates(params.id);
    
    return () => {
      subscription.unsubscribe();
    };
  }, [params.id, subscribeToLeadUpdates]);

  /**
   * Initial data load
   */
  useEffect(() => {
    loadLeadData();
  }, [loadLeadData]);

  if (loading) {
    return (
      <div className="p-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/4 mb-4"></div>
        <div className="h-4 bg-gray-200 rounded w-1/2 mb-2"></div>
        <div className="h-4 bg-gray-200 rounded w-1/3"></div>
      </div>
    );
  }

  if (error) {
    return <ErrorFallback error={new Error(error)} resetErrorBoundary={loadLeadData} />;
  }

  if (!selectedLead) {
    return (
      <div className="p-6">
        <h2 className="text-xl font-semibold text-gray-800">Lead Not Found</h2>
        <p className="mt-2 text-gray-600">The requested lead could not be found.</p>
      </div>
    );
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback} onReset={loadLeadData}>
      <div className="p-6 max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">
            {selectedLead.firstName} {selectedLead.lastName}
          </h1>
          <div className="flex gap-4">
            {hasPermission('MANAGER') && (
              <button
                onClick={handleCallClick}
                className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
              >
                Call Lead
              </button>
            )}
            {hasPermission('ANALYST') && (
              <button
                onClick={handleUpdateScore}
                className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
              >
                Update Score
              </button>
            )}
          </div>
        </div>

        {/* Lead Details */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">Contact Information</h2>
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-sm text-gray-500">Email</dt>
                <dd className="mt-1">{selectedLead.email}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Phone</dt>
                <dd className="mt-1">{selectedLead.phone}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Company</dt>
                <dd className="mt-1">{selectedLead.company}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Status</dt>
                <dd className="mt-1">
                  <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                    selectedLead.status === LeadStatus.QUALIFIED ? 'bg-green-100 text-green-800' :
                    selectedLead.status === LeadStatus.CONTACTED ? 'bg-blue-100 text-blue-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>
                    {selectedLead.status}
                  </span>
                </dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4">AI Insights</h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm text-gray-500">Lead Score</span>
                  <span className="text-sm font-medium">{selectedLead.score}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-2">
                  <div
                    className="bg-blue-600 rounded-full h-2"
                    style={{ width: `${selectedLead.score}%` }}
                  ></div>
                </div>
              </div>
              {selectedLead.metadata.aiEnrichment && (
                <>
                  <div>
                    <dt className="text-sm text-gray-500">Predicted Revenue</dt>
                    <dd className="mt-1 text-lg font-medium">
                      ${selectedLead.metadata.aiEnrichment.predictedRevenue?.toLocaleString()}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-sm text-gray-500">Interests</dt>
                    <dd className="mt-1 flex flex-wrap gap-2">
                      {selectedLead.metadata.aiEnrichment.interests?.map((interest, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800"
                        >
                          {interest}
                        </span>
                      ))}
                    </dd>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        {/* Interaction History */}
        <div className="mt-6 bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold mb-4">Interaction History</h2>
          <div className="space-y-4">
            {selectedLead.interactions.map((interaction, index) => (
              <div
                key={index}
                className="flex items-start gap-4 p-4 border-b last:border-0"
              >
                <div className="flex-1">
                  <div className="flex justify-between">
                    <span className="font-medium">{interaction.type}</span>
                    <span className="text-sm text-gray-500">
                      {new Date(interaction.timestamp).toLocaleString()}
                    </span>
                  </div>
                  {interaction.notes && (
                    <p className="mt-2 text-gray-600">{interaction.notes}</p>
                  )}
                  {interaction.aiInsights && (
                    <div className="mt-2 text-sm">
                      <div className="font-medium text-gray-700">AI Insights:</div>
                      <ul className="mt-1 list-disc list-inside text-gray-600">
                        {interaction.aiInsights.keyPoints.map((point, i) => (
                          <li key={i}>{point}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Performance Metrics (Development Only) */}
        {process.env.NODE_ENV === 'development' && (
          <div className="mt-6 text-xs text-gray-500">
            Load Time: {performanceMetrics.loadTime.toFixed(2)}ms |
            Updates: {performanceMetrics.updateCount} |
            Last Update: {performanceMetrics.lastUpdate?.toLocaleString()}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
};

export default LeadPage;