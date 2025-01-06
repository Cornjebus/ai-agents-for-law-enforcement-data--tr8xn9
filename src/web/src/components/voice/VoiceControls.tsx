/**
 * @fileoverview Enhanced React component for managing voice call controls with geographic routing
 * and real-time performance monitoring capabilities.
 * Version: 1.0.0
 */

import React, { useState, useCallback, useEffect, memo } from 'react'; // v18.2.0
import clsx from 'clsx'; // v2.0.0
import { ErrorBoundary } from 'react-error-boundary'; // v4.0.11
import { useVoice } from '../../hooks/useVoice';
import Button from '../shared/Button';
import { VoiceCallStatus, VoiceQuality, IVoiceCall, VoiceCallMetrics } from '../../types/voice';
import { DESIGN_SYSTEM } from '../../lib/constants';

// Performance thresholds based on technical specifications
const LATENCY_THRESHOLD = 200; // ms
const QUALITY_THRESHOLD = 0.8;

interface VoiceControlsProps {
  campaignId: string;
  phoneNumber: string;
  onCallComplete: (call: IVoiceCall) => void;
  onPerformanceMetric: (metric: VoiceCallMetrics) => void;
  onError: (error: Error) => void;
  geographicConfig: {
    region: string;
    datacenter: string;
    backupRegion: string;
  };
  className?: string;
}

/**
 * Enhanced voice controls component with geographic routing and performance monitoring
 */
const VoiceControls: React.FC<VoiceControlsProps> = memo(({
  campaignId,
  phoneNumber,
  onCallComplete,
  onPerformanceMetric,
  onError,
  geographicConfig,
  className
}) => {
  // Voice hook integration
  const {
    initiateCall,
    synthesizeVoice,
    getGeographicRouting,
    getPerformanceMetrics
  } = useVoice();

  // Component state
  const [isLoading, setIsLoading] = useState(false);
  const [currentCallStatus, setCurrentCallStatus] = useState<VoiceCallStatus | null>(null);
  const [performanceMetrics, setPerformanceMetrics] = useState<VoiceCallMetrics | null>(null);
  const [routingStatus, setRoutingStatus] = useState<{
    currentRegion: string;
    latency: number;
    quality: number;
  } | null>(null);

  /**
   * Monitor call performance metrics
   */
  const monitorPerformance = useCallback(async () => {
    try {
      const metrics = await getPerformanceMetrics();
      setPerformanceMetrics(metrics);
      onPerformanceMetric(metrics);

      // Check for performance issues
      const hasLatencyIssue = metrics.latency.some(m => m.value > LATENCY_THRESHOLD);
      const hasQualityIssue = metrics.mos.some(m => m.value < QUALITY_THRESHOLD);

      if (hasLatencyIssue || hasQualityIssue) {
        await optimizeRouting(metrics);
      }
    } catch (error) {
      console.error('Performance monitoring error:', error);
    }
  }, [getPerformanceMetrics, onPerformanceMetric]);

  /**
   * Optimize geographic routing based on performance metrics
   */
  const optimizeRouting = useCallback(async (metrics: VoiceCallMetrics) => {
    try {
      const routing = await getGeographicRouting();
      const avgLatency = metrics.latency.reduce((sum, m) => sum + m.value, 0) / metrics.latency.length;

      setRoutingStatus({
        currentRegion: routing.region,
        latency: avgLatency,
        quality: metrics.mos[metrics.mos.length - 1]?.value || 0
      });

      // Switch to backup region if needed
      if (avgLatency > LATENCY_THRESHOLD && routing.region !== geographicConfig.backupRegion) {
        await initiateCall(phoneNumber, campaignId, {
          quality: VoiceQuality.HIGH,
          region: geographicConfig.backupRegion
        });
      }
    } catch (error) {
      console.error('Routing optimization error:', error);
      onError(error);
    }
  }, [getGeographicRouting, initiateCall, campaignId, phoneNumber, geographicConfig, onError]);

  /**
   * Handle call initiation with performance monitoring
   */
  const handleCallInitiation = useCallback(async () => {
    try {
      setIsLoading(true);
      setCurrentCallStatus(VoiceCallStatus.CONNECTING);

      // Get optimal routing configuration
      const routing = await getGeographicRouting();
      setRoutingStatus({
        currentRegion: routing.region,
        latency: routing.latency,
        quality: 1.0
      });

      // Initiate call with optimal configuration
      const call = await initiateCall(phoneNumber, campaignId, {
        quality: VoiceQuality.HIGH,
        region: routing.region
      });

      setCurrentCallStatus(VoiceCallStatus.IN_PROGRESS);

      // Start performance monitoring
      const monitoringInterval = setInterval(monitorPerformance, 1000);

      // Handle call completion
      call.on('completed', () => {
        clearInterval(monitoringInterval);
        setCurrentCallStatus(VoiceCallStatus.COMPLETED);
        onCallComplete(call);
      });

      call.on('failed', (error) => {
        clearInterval(monitoringInterval);
        setCurrentCallStatus(VoiceCallStatus.FAILED);
        onError(error);
      });

    } catch (error) {
      console.error('Call initiation error:', error);
      setCurrentCallStatus(VoiceCallStatus.FAILED);
      onError(error);
    } finally {
      setIsLoading(false);
    }
  }, [
    campaignId,
    phoneNumber,
    initiateCall,
    getGeographicRouting,
    monitorPerformance,
    onCallComplete,
    onError
  ]);

  /**
   * Clean up monitoring on unmount
   */
  useEffect(() => {
    return () => {
      if (currentCallStatus === VoiceCallStatus.IN_PROGRESS) {
        // Clean up any active call resources
      }
    };
  }, [currentCallStatus]);

  return (
    <ErrorBoundary
      fallback={<div className="text-error">Error loading voice controls</div>}
      onError={onError}
    >
      <div className={clsx(
        'flex flex-col space-y-4 p-4 rounded-lg border border-gray-200',
        className
      )}>
        {/* Call Control Button */}
        <Button
          variant="primary"
          size="lg"
          isLoading={isLoading}
          isDisabled={currentCallStatus === VoiceCallStatus.IN_PROGRESS}
          onClick={handleCallInitiation}
          className="w-full"
        >
          {currentCallStatus === VoiceCallStatus.IN_PROGRESS ? 'Call in Progress' : 'Start Call'}
        </Button>

        {/* Status Indicators */}
        {currentCallStatus && (
          <div className="flex items-center justify-between text-sm">
            <span className="font-medium">Status:</span>
            <span className={clsx(
              'px-2 py-1 rounded',
              {
                'bg-blue-100 text-blue-800': currentCallStatus === VoiceCallStatus.CONNECTING,
                'bg-green-100 text-green-800': currentCallStatus === VoiceCallStatus.IN_PROGRESS,
                'bg-gray-100 text-gray-800': currentCallStatus === VoiceCallStatus.COMPLETED,
                'bg-red-100 text-red-800': currentCallStatus === VoiceCallStatus.FAILED
              }
            )}>
              {currentCallStatus}
            </span>
          </div>
        )}

        {/* Performance Metrics */}
        {performanceMetrics && (
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span>Latency:</span>
              <span className={clsx({
                'text-red-600': performanceMetrics.latency[0]?.value > LATENCY_THRESHOLD,
                'text-green-600': performanceMetrics.latency[0]?.value <= LATENCY_THRESHOLD
              })}>
                {performanceMetrics.latency[0]?.value.toFixed(0)}ms
              </span>
            </div>
            <div className="flex justify-between">
              <span>Quality:</span>
              <span className={clsx({
                'text-red-600': performanceMetrics.mos[0]?.value < QUALITY_THRESHOLD,
                'text-green-600': performanceMetrics.mos[0]?.value >= QUALITY_THRESHOLD
              })}>
                {performanceMetrics.mos[0]?.value.toFixed(2)}
              </span>
            </div>
          </div>
        )}

        {/* Geographic Routing Info */}
        {routingStatus && (
          <div className="text-sm space-y-1">
            <div className="flex justify-between">
              <span>Region:</span>
              <span>{routingStatus.currentRegion}</span>
            </div>
            <div className="flex justify-between">
              <span>Routing Quality:</span>
              <span className={clsx({
                'text-green-600': routingStatus.quality >= QUALITY_THRESHOLD,
                'text-yellow-600': routingStatus.quality < QUALITY_THRESHOLD && routingStatus.quality >= 0.6,
                'text-red-600': routingStatus.quality < 0.6
              })}>
                {(routingStatus.quality * 100).toFixed(0)}%
              </span>
            </div>
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
});

VoiceControls.displayName = 'VoiceControls';

export default VoiceControls;