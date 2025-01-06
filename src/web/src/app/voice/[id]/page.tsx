'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { ErrorBoundary } from 'react-error-boundary'; // v4.0.11
import clsx from 'clsx'; // v2.0.0
import CallHistory from '../../../components/voice/CallHistory';
import CallMetrics from '../../../components/voice/CallMetrics';
import VoiceControls from '../../../components/voice/VoiceControls';
import { useVoice } from '../../../hooks/useVoice';
import { VoiceCallStatus, VoiceCallMetrics } from '../../../types/voice';
import { ANALYTICS_CONFIG } from '../../../lib/constants';

// Performance thresholds based on technical specifications
const PERFORMANCE_THRESHOLDS = {
  latency: 200, // Maximum RTT in ms
  quality: 0.8, // Minimum quality score
  errors: 0.01 // Maximum error rate
};

// Metadata generation for SEO and accessibility
export async function generateMetadata({ params }: { params: { id: string } }) {
  try {
    const { getCallById } = useVoice();
    const call = await getCallById(params.id);
    
    return {
      title: `Voice Call Details - ${call.phoneNumber}`,
      description: `Real-time monitoring and control for voice call ${params.id}`,
      openGraph: {
        title: `Voice Call Details - ${call.phoneNumber}`,
        description: `Real-time voice call monitoring with performance metrics and geographic routing`,
        type: 'website'
      },
      robots: {
        index: false,
        follow: true
      }
    };
  } catch (error) {
    console.error('Error generating metadata:', error);
    return {
      title: 'Voice Call Details',
      description: 'Voice call monitoring and management'
    };
  }
}

// Error fallback component
const ErrorFallback = ({ error }: { error: Error }) => (
  <div className="p-6 bg-error-50 border border-error-200 rounded-lg">
    <h3 className="text-lg font-semibold text-error-800">Error Loading Voice Call</h3>
    <p className="mt-2 text-error-600">{error.message}</p>
  </div>
);

// Main page component
const VoiceCallPage = async ({ params }: { params: { id: string } }) => {
  // State management
  const [performanceMetrics, setPerformanceMetrics] = useState<VoiceCallMetrics | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  // Custom hooks
  const {
    calls,
    metrics,
    geographicRouting,
    initiateCall,
    useCallSubscription,
    useCallMetrics
  } = useVoice();

  // Get current call data
  const currentCall = calls.find(call => call.id === params.id);

  // Subscribe to real-time call updates
  useEffect(() => {
    if (!params.id) return;

    const unsubscribe = useCallSubscription(params.id, (updatedCall) => {
      // Handle real-time call updates
      if (updatedCall.status === VoiceCallStatus.FAILED) {
        console.error('Call failed:', updatedCall.id);
      }
    });

    return () => unsubscribe();
  }, [params.id, useCallSubscription]);

  // Monitor call performance
  useEffect(() => {
    if (!params.id) return;

    const unsubscribe = useCallMetrics(params.id, (metrics) => {
      setPerformanceMetrics(metrics);

      // Check for performance issues
      const hasLatencyIssue = metrics.latency.some(m => m.value > PERFORMANCE_THRESHOLDS.latency);
      const hasQualityIssue = metrics.quality.some(m => m.value < PERFORMANCE_THRESHOLDS.quality);

      if (hasLatencyIssue || hasQualityIssue) {
        handlePerformanceIssue(metrics);
      }
    });

    return () => unsubscribe();
  }, [params.id, useCallMetrics]);

  // Handle performance issues
  const handlePerformanceIssue = useCallback(async (metrics: VoiceCallMetrics) => {
    if (isOptimizing || !currentCall) return;

    try {
      setIsOptimizing(true);

      // Attempt to optimize routing
      if (geographicRouting?.backupRegion) {
        await initiateCall(
          currentCall.phoneNumber,
          currentCall.campaignId,
          {
            region: geographicRouting.backupRegion
          }
        );
      }
    } catch (error) {
      console.error('Optimization error:', error);
    } finally {
      setIsOptimizing(false);
    }
  }, [currentCall, geographicRouting, initiateCall, isOptimizing]);

  if (!currentCall) {
    return <div>Loading call details...</div>;
  }

  return (
    <ErrorBoundary FallbackComponent={ErrorFallback}>
      <div className="flex flex-col space-y-6 p-6">
        {/* Header */}
        <div className="flex justify-between items-center sticky top-0 bg-white z-10 pb-4 border-b">
          <h1 className="text-2xl font-semibold text-gray-900">
            Voice Call Details
          </h1>
          <div className="flex items-center space-x-4">
            <span className={clsx(
              'px-3 py-1 rounded-full text-sm font-medium',
              {
                'bg-blue-100 text-blue-800': currentCall.status === VoiceCallStatus.IN_PROGRESS,
                'bg-green-100 text-green-800': currentCall.status === VoiceCallStatus.COMPLETED,
                'bg-red-100 text-red-800': currentCall.status === VoiceCallStatus.FAILED,
                'bg-gray-100 text-gray-800': currentCall.status === VoiceCallStatus.PENDING
              }
            )}>
              {currentCall.status}
            </span>
          </div>
        </div>

        {/* Metrics and Controls Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 auto-rows-fr">
          <CallMetrics
            callId={params.id}
            className="h-full"
            refreshInterval={ANALYTICS_CONFIG.UPDATE_INTERVAL}
            showGrid={true}
            showLegend={true}
            geographicRouting={true}
            performanceMode={true}
            thresholds={PERFORMANCE_THRESHOLDS}
          />

          <VoiceControls
            campaignId={currentCall.campaignId}
            phoneNumber={currentCall.phoneNumber}
            onCallComplete={(call) => {
              // Handle call completion
            }}
            onPerformanceMetric={(metrics) => {
              setPerformanceMetrics(metrics);
            }}
            onError={(error) => {
              console.error('Voice control error:', error);
            }}
            geographicConfig={{
              region: geographicRouting?.region || 'us-west-1',
              datacenter: geographicRouting?.datacenter || 'primary',
              backupRegion: geographicRouting?.backupRegion || 'us-east-1'
            }}
            className="h-full"
          />
        </div>

        {/* Call History */}
        <CallHistory
          className="w-full overflow-hidden rounded-lg shadow-lg bg-white"
          pageSize={10}
          showMetrics={true}
          refreshInterval={ANALYTICS_CONFIG.UPDATE_INTERVAL}
          performanceThreshold={PERFORMANCE_THRESHOLDS.latency}
        />
      </div>
    </ErrorBoundary>
  );
};

export default VoiceCallPage;