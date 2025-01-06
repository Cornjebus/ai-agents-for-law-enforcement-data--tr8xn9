'use client';

import React, { Suspense } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import MetricsOverview from '../components/dashboard/MetricsOverview';
import ActivityFeed from '../components/dashboard/ActivityFeed';
import { DESIGN_SYSTEM } from '../lib/constants';

/**
 * Generates static metadata for the landing page with SEO optimization
 */
export function generateMetadata() {
  return {
    title: 'Dashboard - Autonomous Revenue Generation Platform',
    description: 'Real-time revenue metrics, campaign performance, and AI-driven insights for autonomous revenue generation.',
    robots: {
      index: true,
      follow: true,
    },
    openGraph: {
      title: 'Dashboard - Autonomous Revenue Generation Platform',
      description: 'Real-time revenue metrics and AI-driven insights',
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: 'Revenue Generation Dashboard',
      description: 'Real-time revenue metrics and AI-driven insights',
    },
    canonical: process.env.NEXT_PUBLIC_APP_URL,
  };
}

/**
 * Error fallback component for graceful error handling
 */
const ErrorFallback = ({ error, resetErrorBoundary }: { error: Error; resetErrorBoundary: () => void }) => (
  <div className="p-4 rounded-lg bg-red-50 text-red-800">
    <h3 className="text-lg font-semibold mb-2">Something went wrong</h3>
    <p className="text-sm mb-4">{error.message}</p>
    <button
      onClick={resetErrorBoundary}
      className="px-4 py-2 bg-red-100 hover:bg-red-200 rounded-md transition-colors"
    >
      Try again
    </button>
  </div>
);

/**
 * Loading skeleton component for metrics section
 */
const MetricsSkeleton = () => (
  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
    {[...Array(4)].map((_, i) => (
      <div
        key={i}
        className="h-32 bg-gray-100 rounded-lg animate-pulse"
        role="presentation"
      />
    ))}
  </div>
);

/**
 * Loading skeleton component for activity feed
 */
const ActivityFeedSkeleton = () => (
  <div className="h-[400px] bg-gray-100 rounded-lg animate-pulse" role="presentation" />
);

/**
 * Main dashboard page component implementing responsive layout and real-time updates
 */
export default function HomePage() {
  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header Section */}
        <header className="mb-8">
          <h1 
            className={`text-2xl md:text-3xl font-bold text-gray-900 ${DESIGN_SYSTEM.TYPOGRAPHY.fontFamily.primary}`}
          >
            Dashboard
          </h1>
          <p 
            className={`mt-2 text-gray-600 ${DESIGN_SYSTEM.TYPOGRAPHY.fontFamily.secondary}`}
          >
            Real-time performance metrics and activity monitoring
          </p>
        </header>

        {/* Metrics Overview Section */}
        <section 
          aria-label="Performance Metrics"
          className="mb-8"
        >
          <ErrorBoundary
            FallbackComponent={ErrorFallback}
            onReset={() => window.location.reload()}
          >
            <Suspense fallback={<MetricsSkeleton />}>
              <MetricsOverview 
                className="w-full"
                refreshInterval={30000}
                onError={(error) => {
                  console.error('Metrics Error:', error);
                  // Emit error event for monitoring
                  window.dispatchEvent(new CustomEvent('metrics-error', {
                    detail: { error: error.message }
                  }));
                }}
              />
            </Suspense>
          </ErrorBoundary>
        </section>

        {/* Activity Feed Section */}
        <section 
          aria-label="Recent Activity"
          className="mb-8"
        >
          <ErrorBoundary
            FallbackComponent={ErrorFallback}
            onReset={() => window.location.reload()}
          >
            <Suspense fallback={<ActivityFeedSkeleton />}>
              <ActivityFeed
                maxItems={10}
                autoRefresh={true}
                filterTypes={['campaign', 'lead', 'ai']}
                groupByType={false}
                onActivityClick={(activity) => {
                  // Emit activity interaction event for analytics
                  window.dispatchEvent(new CustomEvent('activity-interaction', {
                    detail: {
                      activityId: activity.id,
                      activityType: activity.type,
                      timestamp: Date.now()
                    }
                  }));
                }}
              />
            </Suspense>
          </ErrorBoundary>
        </section>
      </div>
    </main>
  );
}