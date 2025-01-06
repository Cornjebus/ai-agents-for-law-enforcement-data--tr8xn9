'use client';

import React, { Suspense } from 'react';
import { notFound } from 'next/navigation';
import ContentPreview from '../../../components/content/ContentPreview';
import { useContent } from '../../../hooks/useContent';
import { useAuth } from '../../../hooks/useAuth';
import { useAnalytics } from '../../../hooks/useAnalytics';
import { Content, ContentPlatform, ContentStatus } from '../../../types/content';
import { UserRole } from '../../../types/auth';
import { ANALYTICS_CONFIG } from '../../../lib/constants';

// Enhanced metadata generation for SEO
export async function generateMetadata({ params }: { params: { id: string } }) {
  return {
    title: `Content Details - ${params.id}`,
    description: 'AI-optimized content management and analytics',
    openGraph: {
      type: 'article',
      title: `Content Details - ${params.id}`,
      description: 'AI-optimized content management and analytics'
    },
    robots: {
      index: false,
      follow: true
    }
  };
}

// Content page component props
interface ContentPageProps {
  params: {
    id: string;
  };
}

// Content metrics interface
interface ContentMetrics {
  engagement: {
    impressions: number;
    clicks: number;
    conversions: number;
  };
  distribution: {
    platforms: Record<ContentPlatform, boolean>;
    status: Record<ContentPlatform, ContentStatus>;
  };
  performance: {
    score: number;
    aiConfidence: number;
    optimizationLevel: number;
  };
}

// Enhanced content page component
export default function ContentPage({ params }: ContentPageProps) {
  // Initialize hooks with enhanced security and monitoring
  const {
    content,
    metrics,
    aiStatus,
    isLoading,
    error,
    generateContent,
    distributeContent,
    optimizeContent,
    fetchMetrics
  } = useContent();

  const { isAuthenticated, user } = useAuth();
  const { trackMetrics, generateInsights } = useAnalytics({
    refreshInterval: ANALYTICS_CONFIG.UPDATE_INTERVAL,
    enableRealTime: true
  });

  // Security validation
  React.useEffect(() => {
    if (!isAuthenticated || !user) {
      throw new Error('Authentication required');
    }

    // Validate content access permissions
    if (!user.role || ![UserRole.ADMIN, UserRole.CONTENT_CREATOR].includes(user.role)) {
      throw new Error('Insufficient permissions');
    }
  }, [isAuthenticated, user]);

  // Fetch content and metrics
  React.useEffect(() => {
    const fetchContentData = async () => {
      try {
        await fetchMetrics(params.id);
        trackMetrics({
          contentId: params.id,
          type: 'content_view',
          timestamp: Date.now()
        });
      } catch (error) {
        console.error('Error fetching content:', error);
      }
    };

    if (params.id) {
      fetchContentData();
    }
  }, [params.id, fetchMetrics, trackMetrics]);

  // Handle content not found
  if (!content && !isLoading) {
    notFound();
  }

  // Handle AI-driven content optimization
  const handleOptimize = async (platform: ContentPlatform) => {
    try {
      const optimizedContent = await optimizeContent(params.id, platform);
      trackMetrics({
        contentId: params.id,
        type: 'content_optimization',
        platform,
        timestamp: Date.now()
      });
      return optimizedContent;
    } catch (error) {
      console.error('Optimization error:', error);
      throw error;
    }
  };

  // Handle content distribution
  const handleDistribute = async (platforms: ContentPlatform[]) => {
    try {
      await distributeContent(params.id, {
        platforms,
        optimization: {
          abTest: true,
          autoSchedule: true
        }
      });
      trackMetrics({
        contentId: params.id,
        type: 'content_distribution',
        platforms,
        timestamp: Date.now()
      });
    } catch (error) {
      console.error('Distribution error:', error);
      throw error;
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <Suspense fallback={<div>Loading content...</div>}>
        {content && (
          <div className="space-y-8">
            {/* Content Header */}
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {content.metadata.title}
                </h1>
                <p className="mt-2 text-sm text-gray-500">
                  Last updated: {new Date(content.updatedAt).toLocaleString()}
                </p>
              </div>
              <div className="flex space-x-4">
                <button
                  onClick={() => handleOptimize(content.platform)}
                  className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-primary-600 hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                  disabled={isLoading || aiStatus?.status === 'generating'}
                >
                  Optimize Content
                </button>
                <button
                  onClick={() => handleDistribute([content.platform])}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary-500"
                  disabled={isLoading}
                >
                  Distribute
                </button>
              </div>
            </div>

            {/* Content Preview */}
            <div className="bg-white rounded-lg shadow">
              <ContentPreview
                content={content}
                showMetadata={true}
                className="p-6"
                onPreviewError={(error) => {
                  console.error('Preview error:', error);
                  trackMetrics({
                    contentId: params.id,
                    type: 'preview_error',
                    error: error.code,
                    timestamp: Date.now()
                  });
                }}
              />
            </div>

            {/* Performance Metrics */}
            {metrics && (
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                <div className="bg-white rounded-lg shadow px-6 py-5">
                  <h3 className="text-lg font-medium text-gray-900">Engagement</h3>
                  <dl className="mt-4 space-y-4">
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-500">Impressions</dt>
                      <dd className="text-sm font-medium text-gray-900">
                        {metrics.impressions.toLocaleString()}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-sm text-gray-500">Conversions</dt>
                      <dd className="text-sm font-medium text-gray-900">
                        {metrics.conversions.toLocaleString()}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="bg-white rounded-lg shadow px-6 py-5">
                  <h3 className="text-lg font-medium text-gray-900">AI Performance</h3>
                  <dl className="mt-4 space-y-4">
                    {metrics.aiPerformance.map((metric) => (
                      <div key={metric.modelName} className="flex justify-between">
                        <dt className="text-sm text-gray-500">{metric.modelName}</dt>
                        <dd className="text-sm font-medium text-gray-900">
                          {(metric.confidenceScore * 100).toFixed(1)}%
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>

                <div className="bg-white rounded-lg shadow px-6 py-5">
                  <h3 className="text-lg font-medium text-gray-900">Distribution</h3>
                  <dl className="mt-4 space-y-4">
                    {Object.entries(metrics.performance).map(([key, value]) => (
                      <div key={key} className="flex justify-between">
                        <dt className="text-sm text-gray-500">{key}</dt>
                        <dd className="text-sm font-medium text-gray-900">
                          {typeof value === 'number' ? value.toFixed(2) : value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Error handling */}
        {error && (
          <div className="rounded-md bg-red-50 p-4 mt-4">
            <div className="flex">
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Error</h3>
                <div className="mt-2 text-sm text-red-700">{error}</div>
              </div>
            </div>
          </div>
        )}
      </Suspense>
    </div>
  );
}