/**
 * @fileoverview Enhanced React hook for managing analytics state and operations
 * Provides real-time metrics, performance monitoring, and data management capabilities
 * @version 1.0.0
 */

import { useEffect, useCallback, useRef } from 'react'; // v18.2.0
import { useDispatch, useSelector } from 'react-redux'; // v8.1.0
import { io, Socket } from 'socket.io-client'; // v4.7.2
import {
  selectMetrics,
  selectCharts,
  selectAnalyticsFilter,
  selectAnalyticsLoading,
  selectAnalyticsError,
  fetchMetrics,
  fetchChartData,
  exportAnalytics
} from '../store/analyticsSlice';
import {
  IAnalyticsMetric,
  IChartData,
  IAnalyticsFilter,
  MetricType
} from '../types/analytics';
import { ANALYTICS_CONFIG } from '../lib/constants';

/**
 * Interface for analytics hook configuration
 */
interface IAnalyticsConfig {
  refreshInterval?: number;
  enableRealTime?: boolean;
  performanceMonitoring?: boolean;
}

/**
 * Interface for real-time updates subscription
 */
interface IAnalyticsUpdate {
  metrics: IAnalyticsMetric[];
  timestamp: number;
}

/**
 * Default configuration for analytics hook
 */
const DEFAULT_CONFIG: IAnalyticsConfig = {
  refreshInterval: ANALYTICS_CONFIG.UPDATE_INTERVAL,
  enableRealTime: true,
  performanceMonitoring: true
};

/**
 * Enhanced custom hook for managing analytics state and operations
 */
export function useAnalytics(
  initialFilter?: Partial<IAnalyticsFilter>,
  config: IAnalyticsConfig = DEFAULT_CONFIG
) {
  const dispatch = useDispatch();
  const socketRef = useRef<Socket | null>(null);
  const updateCallbacksRef = useRef<Set<(data: IAnalyticsUpdate) => void>>(new Set());

  // Select analytics state from Redux store
  const metrics = useSelector(selectMetrics);
  const charts = useSelector(selectCharts);
  const filter = useSelector(selectAnalyticsFilter);
  const isLoading = useSelector(selectAnalyticsLoading);
  const error = useSelector(selectAnalyticsError);

  /**
   * Fetch metrics data with performance monitoring
   */
  const fetchMetricsData = useCallback(async (filter: IAnalyticsFilter) => {
    const startTime = performance.now();
    try {
      await dispatch(fetchMetrics(filter));
      const endTime = performance.now();
      
      // Monitor performance
      if (config.performanceMonitoring && endTime - startTime > ANALYTICS_CONFIG.PERFORMANCE_THRESHOLDS[MetricType.API_LATENCY]) {
        window.dispatchEvent(new CustomEvent('analytics-performance-alert', {
          detail: {
            operation: 'fetchMetrics',
            duration: endTime - startTime,
            threshold: ANALYTICS_CONFIG.PERFORMANCE_THRESHOLDS[MetricType.API_LATENCY]
          }
        }));
      }
    } catch (error) {
      console.error('Error fetching metrics:', error);
      throw error;
    }
  }, [dispatch, config.performanceMonitoring]);

  /**
   * Fetch chart data with streaming support
   */
  const fetchChartDataWithStreaming = useCallback(async (
    metricType: MetricType,
    filter: IAnalyticsFilter
  ) => {
    const startTime = performance.now();
    try {
      await dispatch(fetchChartData({ metricType, filter }));
      const endTime = performance.now();

      if (config.performanceMonitoring && endTime - startTime > ANALYTICS_CONFIG.PERFORMANCE_THRESHOLDS[MetricType.API_LATENCY]) {
        window.dispatchEvent(new CustomEvent('analytics-performance-alert', {
          detail: {
            operation: 'fetchChartData',
            duration: endTime - startTime,
            threshold: ANALYTICS_CONFIG.PERFORMANCE_THRESHOLDS[MetricType.API_LATENCY]
          }
        }));
      }
    } catch (error) {
      console.error('Error fetching chart data:', error);
      throw error;
    }
  }, [dispatch, config.performanceMonitoring]);

  /**
   * Export analytics data with compression
   */
  const exportData = useCallback(async (
    filter: IAnalyticsFilter,
    format: string
  ) => {
    try {
      await dispatch(exportAnalytics({ filter, format }));
    } catch (error) {
      console.error('Error exporting analytics:', error);
      throw error;
    }
  }, [dispatch]);

  /**
   * Subscribe to real-time analytics updates
   */
  const subscribeToUpdates = useCallback((callback: (data: IAnalyticsUpdate) => void) => {
    updateCallbacksRef.current.add(callback);
    return () => {
      updateCallbacksRef.current.delete(callback);
    };
  }, []);

  /**
   * Unsubscribe from real-time updates
   */
  const unsubscribeFromUpdates = useCallback(() => {
    updateCallbacksRef.current.clear();
    if (socketRef.current?.connected) {
      socketRef.current.disconnect();
    }
  }, []);

  /**
   * Initialize WebSocket connection for real-time updates
   */
  useEffect(() => {
    if (!config.enableRealTime) return;

    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL || ''}/analytics`;
    socketRef.current = io(wsUrl, {
      transports: ['websocket'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    socketRef.current.on('connect', () => {
      console.log('Analytics WebSocket connected');
    });

    socketRef.current.on('metrics_update', (data: IAnalyticsUpdate) => {
      const startTime = performance.now();
      updateCallbacksRef.current.forEach(callback => callback(data));
      
      const processingTime = performance.now() - startTime;
      if (config.performanceMonitoring && processingTime > ANALYTICS_CONFIG.PERFORMANCE_THRESHOLDS[MetricType.API_LATENCY]) {
        window.dispatchEvent(new CustomEvent('analytics-performance-alert', {
          detail: {
            operation: 'websocketUpdate',
            duration: processingTime,
            threshold: ANALYTICS_CONFIG.PERFORMANCE_THRESHOLDS[MetricType.API_LATENCY]
          }
        }));
      }
    });

    return () => {
      if (socketRef.current?.connected) {
        socketRef.current.disconnect();
      }
    };
  }, [config.enableRealTime, config.performanceMonitoring]);

  /**
   * Set up automatic refresh interval
   */
  useEffect(() => {
    if (!config.refreshInterval) return;

    const intervalId = setInterval(() => {
      if (filter) {
        fetchMetricsData(filter).catch(console.error);
      }
    }, config.refreshInterval);

    return () => clearInterval(intervalId);
  }, [config.refreshInterval, filter, fetchMetricsData]);

  return {
    metrics,
    charts,
    filter,
    isLoading,
    error,
    fetchMetricsData,
    fetchChartData: fetchChartDataWithStreaming,
    exportData,
    subscribeToUpdates,
    unsubscribeFromUpdates
  };
}