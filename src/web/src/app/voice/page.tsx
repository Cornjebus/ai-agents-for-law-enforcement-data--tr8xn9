'use client';

import React, { useEffect, useState, useCallback } from 'react';
import { ErrorBoundary } from 'react-error-boundary';
import CallHistory from '@/components/voice/CallHistory';
import CallMetrics from '@/components/voice/CallMetrics';
import VoiceControls from '@/components/voice/VoiceControls';
import VoiceSettings from '@/components/voice/VoiceSettings';
import { useVoice } from '@/hooks/useVoice';
import { VoiceCallStatus, VoiceQuality, RoutingStrategy } from '../../types/voice';
import { ANALYTICS_CONFIG } from '../../lib/constants';

// Performance thresholds based on technical specifications
const PERFORMANCE_THRESHOLDS = {
  latency: 200, // Maximum RTT in ms
  quality: 0.95, // Minimum quality score
  errors: 0.01, // Maximum error rate
  routingTimeout: 50 // ms
};

/**
 * Enhanced voice management page component with AI and performance optimization
 */
const VoicePage: React.FC = () => {
  // Voice hook integration with enhanced features
  const {
    calls,
    metrics,
    geographicRouting,
    aiConfig,
    error,
    initiateCall,
    synthesizeVoice,
    getGeographicRouting,
    getPerformanceMetrics
  } = useVoice();

  // Local state for performance monitoring
  const [performanceMetrics, setPerformanceMetrics] = useState<any>(null);
  const [routingOptimization, setRoutingOptimization] = useState<{
    inProgress: boolean;
    lastOptimized: Date | null;
  }>({
    inProgress: false,
    lastOptimized: null
  });

  /**
   * Monitor voice call performance with geographic routing optimization
   */
  const monitorPerformance = useCallback(async () => {
    try {
      const metrics = await getPerformanceMetrics();
      setPerformanceMetrics(metrics);

      // Check for performance issues
      const hasLatencyIssue = metrics.latency.some(m => 
        m.value > PERFORMANCE_THRESHOLDS.latency
      );
      const hasQualityIssue = metrics.quality < PERFORMANCE_THRESHOLDS.quality;

      if (hasLatencyIssue || hasQualityIssue) {
        await optimizeRouting();
      }
    } catch (error) {
      console.error('Performance monitoring error:', error);
    }
  }, [getPerformanceMetrics]);

  /**
   * Optimize geographic routing based on performance metrics
   */
  const optimizeRouting = useCallback(async () => {
    if (routingOptimization.inProgress) return;

    try {
      setRoutingOptimization(prev => ({ ...prev, inProgress: true }));
      const routing = await getGeographicRouting();

      // Emit performance event for monitoring
      window.dispatchEvent(new CustomEvent('voice-routing-optimization', {
        detail: {
          previousRegion: geographicRouting?.region,
          newRegion: routing.region,
          latency: routing.latency,
          timestamp: new Date()
        }
      }));

      setRoutingOptimization({
        inProgress: false,
        lastOptimized: new Date()
      });
    } catch (error) {
      console.error('Routing optimization error:', error);
      setRoutingOptimization(prev => ({ ...prev, inProgress: false }));
    }
  }, [getGeographicRouting, geographicRouting]);

  /**
   * Handle voice settings updates with performance optimization
   */
  const handleSettingsChange = useCallback(async (settings: any) => {
    try {
      // Test voice synthesis with new settings
      await synthesizeVoice({
        text: 'Testing voice configuration',
        voiceId: settings.defaultVoiceId,
        engine: settings.preferredEngine,
        quality: settings.qualityPreference,
        language: settings.defaultLanguage
      });

      // Optimize routing if geographic routing is enabled
      if (settings.geographicRouting.enabled) {
        await optimizeRouting();
      }
    } catch (error) {
      console.error('Settings update error:', error);
    }
  }, [synthesizeVoice, optimizeRouting]);

  // Initialize performance monitoring
  useEffect(() => {
    const monitoringInterval = setInterval(monitorPerformance, 
      ANALYTICS_CONFIG.UPDATE_INTERVAL
    );

    return () => clearInterval(monitoringInterval);
  }, [monitorPerformance]);

  return (
    <ErrorBoundary
      fallback={<div className="text-error-500">Error loading voice management</div>}
      onError={(error) => {
        console.error('Voice management error:', error);
      }}
    >
      <div className="space-y-6 p-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-semibold text-gray-900">Voice Management</h1>
          
          {/* Performance Status Indicator */}
          {performanceMetrics && (
            <div className="flex items-center space-x-4">
              <div className="text-sm">
                <span className="text-gray-500">Latency:</span>
                <span className={`ml-2 font-medium ${
                  performanceMetrics.latency > PERFORMANCE_THRESHOLDS.latency
                    ? 'text-error-600'
                    : 'text-success-600'
                }`}>
                  {performanceMetrics.latency}ms
                </span>
              </div>
              <div className="text-sm">
                <span className="text-gray-500">Quality:</span>
                <span className={`ml-2 font-medium ${
                  performanceMetrics.quality < PERFORMANCE_THRESHOLDS.quality
                    ? 'text-warning-600'
                    : 'text-success-600'
                }`}>
                  {(performanceMetrics.quality * 100).toFixed(0)}%
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Voice Controls Section */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <VoiceControls
            campaignId="current-campaign"
            phoneNumber=""
            onCallComplete={(call) => {
              console.log('Call completed:', call);
            }}
            onPerformanceMetric={(metric) => {
              setPerformanceMetrics(metric);
            }}
            onError={(error) => {
              console.error('Voice control error:', error);
            }}
            geographicConfig={{
              region: geographicRouting?.region || 'us-west-1',
              datacenter: geographicRouting?.datacenter || 'primary',
              backupRegion: geographicRouting?.backupRegion || 'us-east-1'
            }}
            className="lg:col-span-1"
          />

          {/* Real-time Metrics */}
          <CallMetrics
            callId={calls[0]?.id}
            className="lg:col-span-1"
            refreshInterval={ANALYTICS_CONFIG.UPDATE_INTERVAL}
            showGrid={true}
            showLegend={true}
            geographicRouting={true}
            performanceMode={true}
            thresholds={PERFORMANCE_THRESHOLDS}
          />
        </div>

        {/* Call History */}
        <CallHistory
          className="mt-6"
          pageSize={10}
          showMetrics={true}
          refreshInterval={ANALYTICS_CONFIG.UPDATE_INTERVAL}
          performanceThreshold={PERFORMANCE_THRESHOLDS.latency}
        />

        {/* Voice Settings */}
        <VoiceSettings
          initialSettings={{
            defaultVoiceId: 'en-US-Neural2-D',
            preferredEngine: 'NEURAL_HD',
            defaultLanguage: 'en-US',
            qualityPreference: VoiceQuality.HIGH,
            speedMultiplier: 1,
            latencyThreshold: PERFORMANCE_THRESHOLDS.latency,
            autoReconnect: true,
            noiseReduction: true,
            echoReduction: true,
            geographicRouting: {
              enabled: true,
              region: geographicRouting?.region || 'us-west-1',
              optimizationStrategy: RoutingStrategy.LOWEST_LATENCY
            }
          }}
          onSettingsChange={handleSettingsChange}
          geographicRegion={geographicRouting?.region || 'us-west-1'}
          performanceThresholds={PERFORMANCE_THRESHOLDS}
        />
      </div>
    </ErrorBoundary>
  );
};

export default VoicePage;