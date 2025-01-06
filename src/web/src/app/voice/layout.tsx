'use client';

import React, { useEffect, useCallback, useState, useRef } from 'react';
import clsx from 'clsx';
import { Navigation } from '../../components/shared/Navigation';
import { Sidebar } from '../../components/shared/Sidebar';
import { DESIGN_SYSTEM, AI_CONFIG } from '../../lib/constants';

// Voice layout props interface
interface VoiceLayoutProps {
  children: React.ReactNode;
  voiceEnabled?: boolean;
  geographicRegion?: string;
}

// Voice processing status type
type VoiceStatus = 'idle' | 'processing' | 'error';

// Voice performance metrics interface
interface VoiceMetrics {
  latency: number;
  quality: number;
  errorRate: number;
}

/**
 * VoiceLayout component providing voice processing capabilities and layout structure
 * @version 1.0.0
 */
const VoiceLayout: React.FC<VoiceLayoutProps> = ({
  children,
  voiceEnabled = true,
  geographicRegion = 'us-west'
}) => {
  // State management
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const [voiceMetrics, setVoiceMetrics] = useState<VoiceMetrics>({
    latency: 0,
    quality: 100,
    errorRate: 0
  });

  // Refs for performance monitoring
  const processingStartTime = useRef<number>(0);
  const metricsInterval = useRef<NodeJS.Timeout>();

  // Voice processing configuration
  const voiceConfig = {
    ...AI_CONFIG.VOICE_SYNTHESIS,
    region: geographicRegion,
    maxLatency: 200, // ms
    qualityThreshold: 0.85
  };

  /**
   * Monitor voice processing performance
   */
  const monitorVoicePerformance = useCallback(() => {
    if (!voiceEnabled) return;

    const currentLatency = Date.now() - processingStartTime.current;
    setVoiceMetrics(prev => ({
      ...prev,
      latency: currentLatency,
      quality: Math.max(0, 100 - (currentLatency / voiceConfig.maxLatency) * 100)
    }));

    // Emit performance metrics for monitoring
    window.dispatchEvent(new CustomEvent('voice-metrics', {
      detail: {
        latency: currentLatency,
        quality: voiceMetrics.quality,
        errorRate: voiceMetrics.errorRate,
        timestamp: Date.now()
      }
    }));
  }, [voiceEnabled, voiceMetrics.errorRate, voiceMetrics.quality]);

  /**
   * Initialize voice processing monitoring
   */
  useEffect(() => {
    if (!voiceEnabled) return;

    metricsInterval.current = setInterval(monitorVoicePerformance, 1000);
    
    return () => {
      if (metricsInterval.current) {
        clearInterval(metricsInterval.current);
      }
    };
  }, [voiceEnabled, monitorVoicePerformance]);

  /**
   * Handle voice processing status changes
   */
  useEffect(() => {
    const handleVoiceStatusChange = (status: VoiceStatus) => {
      setVoiceStatus(status);
      
      // Update ARIA live region for accessibility
      const announcement = `Voice processing ${status}`;
      const liveRegion = document.getElementById('voice-status-announcer');
      if (liveRegion) {
        liveRegion.textContent = announcement;
      }
    };

    if (voiceEnabled) {
      handleVoiceStatusChange('idle');
    }
  }, [voiceEnabled]);

  /**
   * Handle sidebar collapse toggle
   */
  const handleSidebarCollapse = useCallback(() => {
    setIsSidebarCollapsed(prev => !prev);
  }, []);

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Accessibility live region for voice status */}
      <div
        id="voice-status-announcer"
        className="sr-only"
        role="status"
        aria-live="polite"
      />

      {/* Sidebar */}
      <Sidebar
        isCollapsed={isSidebarCollapsed}
        onCollapse={handleSidebarCollapse}
        className={clsx(
          'fixed inset-y-0 left-0 z-30',
          'transition-transform duration-300 ease-in-out',
          {
            '-translate-x-full': isSidebarCollapsed,
            'translate-x-0': !isSidebarCollapsed
          }
        )}
      />

      {/* Main content area */}
      <div className={clsx(
        'flex-1 flex flex-col',
        'transition-all duration-300 ease-in-out',
        {
          'ml-64': !isSidebarCollapsed,
          'ml-16': isSidebarCollapsed
        }
      )}>
        {/* Top navigation */}
        <Navigation
          className="sticky top-0 z-20 bg-white shadow-sm"
        />

        {/* Voice processing status bar */}
        {voiceEnabled && (
          <div
            className={clsx(
              'h-1 transition-all duration-300',
              {
                'bg-green-500': voiceStatus === 'idle',
                'bg-blue-500 animate-pulse': voiceStatus === 'processing',
                'bg-red-500': voiceStatus === 'error'
              }
            )}
            role="progressbar"
            aria-valuetext={voiceStatus}
            aria-label="Voice processing status"
          />
        )}

        {/* Voice metrics display */}
        {voiceEnabled && (
          <div
            className="bg-gray-800 text-white px-4 py-2 text-sm flex justify-between"
            aria-label="Voice processing metrics"
          >
            <span>Latency: {voiceMetrics.latency}ms</span>
            <span>Quality: {voiceMetrics.quality.toFixed(1)}%</span>
            <span>Error Rate: {voiceMetrics.errorRate.toFixed(2)}%</span>
          </div>
        )}

        {/* Main content */}
        <main
          className={clsx(
            'flex-1 overflow-y-auto',
            'p-6 bg-gray-50',
            DESIGN_SYSTEM.TYPOGRAPHY.fontFamily.primary
          )}
          style={{
            scrollBehavior: 'smooth',
            WebkitOverflowScrolling: 'touch'
          }}
        >
          {children}
        </main>
      </div>
    </div>
  );
};

export default VoiceLayout;