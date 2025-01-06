import React, { useMemo, useEffect, useCallback, useRef } from 'react';
import clsx from 'clsx'; // v2.0.0
import Chart from '../shared/Chart';
import { useVoice } from '../../hooks/useVoice';
import { IVoiceCall, VoiceCallMetrics, VoiceMetricType, GeographicRouting } from '../../types/voice';

// Constants for metrics visualization
const DEFAULT_REFRESH_INTERVAL = 5000;
const RETRY_ATTEMPTS = 3;
const RETRY_DELAY = 1000;
const METRIC_COLORS = {
  latency: '#2563EB',
  quality: '#059669',
  duration: '#3B82F6',
  errors: '#DC2626',
  routing: '#8B5CF6'
};

// Performance thresholds based on technical specifications
const PERFORMANCE_THRESHOLDS = {
  latency: 200, // Maximum RTT in ms
  quality: 0.95, // Minimum quality score
  errors: 0.01 // Maximum error rate
};

interface MetricThresholds {
  warning: number;
  critical: number;
}

interface CallMetricsProps {
  callId: string;
  className?: string;
  refreshInterval?: number;
  showGrid?: boolean;
  showLegend?: boolean;
  geographicRouting?: boolean;
  performanceMode?: boolean;
  thresholds?: Record<VoiceMetricType, MetricThresholds>;
}

/**
 * Enhanced formatter for call metrics data with geographic routing and performance indicators
 */
const formatMetricsData = (
  metrics: VoiceCallMetrics,
  routing: GeographicRouting | null,
  thresholds?: Record<VoiceMetricType, MetricThresholds>
) => {
  const datasets = Object.entries(metrics).map(([metricType, values]) => {
    const color = METRIC_COLORS[metricType as keyof typeof METRIC_COLORS];
    
    return {
      label: metricType.charAt(0).toUpperCase() + metricType.slice(1),
      data: values.map(v => v.value),
      borderColor: color,
      backgroundColor: `${color}20`,
      fill: false,
      tension: 0.4,
      pointRadius: 2,
      pointHoverRadius: 4,
      thresholds: thresholds?.[metricType as VoiceMetricType]
    };
  });

  // Add geographic routing overlay if enabled
  if (routing) {
    datasets.push({
      label: 'Geographic Routing',
      data: new Array(datasets[0].data.length).fill(routing.latency),
      borderColor: METRIC_COLORS.routing,
      borderDash: [5, 5],
      fill: false,
      pointRadius: 0
    });
  }

  return {
    labels: metrics.latency.map(m => new Date(m.timestamp).toLocaleTimeString()),
    datasets
  };
};

/**
 * Enhanced CallMetrics component for displaying voice call metrics with geographic routing
 * and performance monitoring capabilities
 */
export const CallMetrics: React.FC<CallMetricsProps> = ({
  callId,
  className,
  refreshInterval = DEFAULT_REFRESH_INTERVAL,
  showGrid = true,
  showLegend = true,
  geographicRouting = true,
  performanceMode = true,
  thresholds
}) => {
  const chartRef = useRef<any>(null);
  const retryCount = useRef(0);
  const { calls, metrics, geographicRouting: routing } = useVoice();

  // Get current call data
  const currentCall = useMemo(() => 
    calls.find(call => call.id === callId),
    [calls, callId]
  );

  // Format metrics data with routing information
  const chartData = useMemo(() => {
    if (!metrics) return null;
    return formatMetricsData(
      metrics,
      geographicRouting ? routing : null,
      thresholds
    );
  }, [metrics, geographicRouting, routing, thresholds]);

  // Performance monitoring callback
  const monitorPerformance = useCallback((newMetrics: VoiceCallMetrics) => {
    if (!performanceMode) return;

    const latencyAlert = newMetrics.latency.some(m => 
      m.value > PERFORMANCE_THRESHOLDS.latency
    );
    const qualityAlert = newMetrics.quality.some(m => 
      m.value < PERFORMANCE_THRESHOLDS.quality
    );
    const errorAlert = newMetrics.errors.some(m => 
      m.value > PERFORMANCE_THRESHOLDS.errors
    );

    if (latencyAlert || qualityAlert || errorAlert) {
      window.dispatchEvent(new CustomEvent('voice-performance-alert', {
        detail: {
          callId,
          latencyAlert,
          qualityAlert,
          errorAlert,
          timestamp: new Date()
        }
      }));
    }
  }, [callId, performanceMode]);

  // Update chart with retry mechanism
  const updateChart = useCallback(async () => {
    try {
      if (!currentCall || !chartData || !chartRef.current) return;

      chartRef.current.update();
      retryCount.current = 0;

      if (performanceMode) {
        monitorPerformance(metrics!);
      }
    } catch (error) {
      console.error('Chart update error:', error);
      
      if (retryCount.current < RETRY_ATTEMPTS) {
        retryCount.current++;
        setTimeout(updateChart, RETRY_DELAY);
      }
    }
  }, [currentCall, chartData, metrics, performanceMode, monitorPerformance]);

  // Set up refresh interval
  useEffect(() => {
    if (refreshInterval <= 0) return;

    const intervalId = setInterval(updateChart, refreshInterval);
    return () => clearInterval(intervalId);
  }, [refreshInterval, updateChart]);

  if (!currentCall || !chartData) {
    return null;
  }

  return (
    <div 
      className={clsx(
        'call-metrics-container',
        'rounded-lg border border-gray-200 p-4',
        className
      )}
      role="region"
      aria-label="Voice Call Metrics"
    >
      <Chart
        ref={chartRef}
        data={chartData}
        type="line"
        height={300}
        width="100%"
        showGrid={showGrid}
        showLegend={showLegend}
        showTooltip={true}
        thresholds={thresholds}
        refreshInterval={refreshInterval}
        accessibilityLabel={`Metrics for call ${callId}`}
      />
    </div>
  );
};

export default CallMetrics;