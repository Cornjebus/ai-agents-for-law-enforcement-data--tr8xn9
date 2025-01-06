'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import useWebSocket from 'react-use-websocket';

import MetricsOverview from '../../components/dashboard/MetricsOverview';
import ActivityFeed from '../../components/dashboard/ActivityFeed';
import RecentCampaigns from '../../components/dashboard/RecentCampaigns';
import QuickActions from '../../components/dashboard/QuickActions';
import { useAnalytics } from '../../hooks/useAnalytics';
import { ANALYTICS_CONFIG } from '../../lib/constants';

// Error Fallback component for error boundaries
const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => (
  <div className="p-4 bg-red-50 border border-red-200 rounded-lg" role="alert">
    <h3 className="text-lg font-semibold text-red-800">Dashboard Section Error</h3>
    <p className="text-red-600 mt-1">{error.message}</p>
    <button
      onClick={resetErrorBoundary}
      className="mt-2 px-4 py-2 bg-red-100 text-red-800 rounded hover:bg-red-200"
    >
      Retry
    </button>
  </div>
);

/**
 * Main dashboard page component implementing Next.js 13 server component pattern
 * with enhanced error handling, accessibility, and performance optimization
 */
export default function Dashboard() {
  const [wsUrl] = useState(`${process.env.NEXT_PUBLIC_WS_URL || ''}/dashboard`);
  const { trackEvent } = useAnalytics();
  const [isLoading, setIsLoading] = useState(true);

  // WebSocket connection for real-time updates
  const { lastMessage, readyState } = useWebSocket(wsUrl, {
    reconnectInterval: 3000,
    shouldReconnect: () => true,
    onOpen: () => {
      console.log('Dashboard WebSocket connected');
    },
    onError: (error) => {
      console.error('Dashboard WebSocket error:', error);
      window.dispatchEvent(new CustomEvent('dashboard-websocket-error', {
        detail: { error: error.message, timestamp: Date.now() }
      }));
    }
  });

  // Handle real-time updates
  useEffect(() => {
    if (lastMessage) {
      try {
        const data = JSON.parse(lastMessage.data);
        // Emit dashboard update event for monitoring
        window.dispatchEvent(new CustomEvent('dashboard-update', {
          detail: { type: data.type, timestamp: Date.now() }
        }));
      } catch (error) {
        console.error('Error processing dashboard update:', error);
      }
    }
  }, [lastMessage]);

  // Track dashboard view
  useEffect(() => {
    trackEvent({
      category: 'Dashboard',
      action: 'view',
      label: 'main_dashboard'
    });
    
    const loadingTimeout = setTimeout(() => {
      setIsLoading(false);
    }, 1000);

    return () => clearTimeout(loadingTimeout);
  }, [trackEvent]);

  // Handle error boundary reset
  const handleErrorReset = useCallback(() => {
    window.location.reload();
  }, []);

  return (
    <main 
      className="p-6 max-w-7xl mx-auto"
      role="main"
      aria-label="Dashboard"
    >
      <h1 className="sr-only">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* Metrics Overview Section */}
        <section className="col-span-full">
          <ErrorBoundary
            FallbackComponent={ErrorFallback}
            onReset={handleErrorReset}
          >
            <MetricsOverview
              className="mb-6"
              refreshInterval={ANALYTICS_CONFIG.UPDATE_INTERVAL}
            />
          </ErrorBoundary>
        </section>

        {/* Quick Actions Section */}
        <section 
          className="col-span-full"
          role="navigation"
          aria-label="Quick Actions"
        >
          <ErrorBoundary
            FallbackComponent={ErrorFallback}
            onReset={handleErrorReset}
          >
            <QuickActions />
          </ErrorBoundary>
        </section>

        {/* Recent Campaigns Section */}
        <section 
          className="col-span-1 md:col-span-2"
          role="region"
          aria-label="Recent Campaigns"
        >
          <ErrorBoundary
            FallbackComponent={ErrorFallback}
            onReset={handleErrorReset}
          >
            <RecentCampaigns
              limit={5}
              updateInterval={ANALYTICS_CONFIG.UPDATE_INTERVAL}
              showAIMetrics={true}
            />
          </ErrorBoundary>
        </section>

        {/* Activity Feed Section */}
        <section 
          className="col-span-1"
          role="complementary"
          aria-label="Activity Feed"
        >
          <ErrorBoundary
            FallbackComponent={ErrorFallback}
            onReset={handleErrorReset}
          >
            <ActivityFeed
              maxItems={10}
              autoRefresh={true}
              filterTypes={['campaign', 'lead', 'ai']}
            />
          </ErrorBoundary>
        </section>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div 
          className="fixed inset-0 bg-white bg-opacity-75 flex items-center justify-center z-50"
          role="status"
          aria-label="Loading dashboard"
        >
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
        </div>
      )}
    </main>
  );
}