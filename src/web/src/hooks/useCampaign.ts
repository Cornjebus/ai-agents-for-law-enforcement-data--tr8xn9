/**
 * @fileoverview Advanced React hook for managing campaign operations with real-time analytics,
 * AI-driven optimization, and performance-optimized state management.
 * @version 1.0.0
 */

import { useState, useEffect, useCallback } from 'react'; // v18.2.0
import { useDispatch, useSelector } from 'react-redux'; // v8.1.0
import { debounce } from 'lodash'; // v4.17.21
import { io, Socket } from 'socket.io-client'; // v4.7.2

import { ICampaign, CampaignStatus } from '../types/campaign';
import { 
  selectCampaignById, 
  selectCampaignMetrics, 
  fetchCampaigns,
  optimizeCampaign,
  updateCampaignMetrics
} from '../store/campaignSlice';
import { API_CONFIG, AI_CONFIG } from '../lib/constants';

// WebSocket configuration for real-time updates
const SOCKET_CONFIG = {
  path: '/campaign-updates',
  reconnection: true,
  reconnectionDelay: 1000,
  reconnectionDelayMax: 5000,
  timeout: 20000
};

// Optimization state interface
interface OptimizationState {
  inProgress: boolean;
  lastOptimized: Date | null;
  score: number;
  recommendations: string[];
  error: string | null;
}

// Hook return type
interface UseCampaignReturn {
  campaign: ICampaign | null;
  loading: boolean;
  error: string | null;
  metrics: ICampaignMetrics | null;
  optimization: OptimizationState;
  actions: {
    refresh: () => Promise<void>;
    optimize: () => Promise<void>;
    updateMetrics: (metrics: Partial<ICampaignMetrics>) => void;
  };
}

/**
 * Advanced hook for managing campaign operations with real-time updates
 * and AI-driven optimization capabilities
 */
export function useCampaign(campaignId?: string): UseCampaignReturn {
  const dispatch = useDispatch();
  const [socket, setSocket] = useState<Socket | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [optimization, setOptimization] = useState<OptimizationState>({
    inProgress: false,
    lastOptimized: null,
    score: 0,
    recommendations: [],
    error: null
  });

  // Select campaign and metrics from Redux store
  const campaign = useSelector(campaignId ? selectCampaignById(campaignId) : null);
  const metrics = useSelector(campaignId ? selectCampaignMetrics(campaignId) : null);

  /**
   * Debounced metrics update handler to prevent excessive updates
   */
  const debouncedMetricsUpdate = useCallback(
    debounce((updatedMetrics: Partial<ICampaignMetrics>) => {
      if (campaignId) {
        dispatch(updateCampaignMetrics({ 
          id: campaignId, 
          metrics: { ...metrics, ...updatedMetrics } 
        }));
      }
    }, 1000),
    [campaignId, metrics, dispatch]
  );

  /**
   * Initialize WebSocket connection for real-time updates
   */
  useEffect(() => {
    if (!campaignId) return;

    const newSocket = io(API_CONFIG.BASE_URL, {
      ...SOCKET_CONFIG,
      query: { campaignId }
    });

    newSocket.on('connect', () => {
      console.log('Campaign WebSocket connected');
    });

    newSocket.on('metrics_update', (updatedMetrics: Partial<ICampaignMetrics>) => {
      debouncedMetricsUpdate(updatedMetrics);
    });

    newSocket.on('optimization_update', (update: Partial<OptimizationState>) => {
      setOptimization(prev => ({ ...prev, ...update }));
    });

    newSocket.on('error', (err: Error) => {
      setError(`WebSocket error: ${err.message}`);
    });

    setSocket(newSocket);

    return () => {
      newSocket.disconnect();
      setSocket(null);
    };
  }, [campaignId, debouncedMetricsUpdate]);

  /**
   * Refresh campaign data and metrics
   */
  const refresh = useCallback(async () => {
    if (!campaignId) return;

    try {
      setLoading(true);
      setError(null);
      await dispatch(fetchCampaigns({ id: campaignId }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to refresh campaign');
    } finally {
      setLoading(false);
    }
  }, [campaignId, dispatch]);

  /**
   * Trigger AI-driven campaign optimization
   */
  const optimize = useCallback(async () => {
    if (!campaignId || optimization.inProgress) return;

    try {
      setOptimization(prev => ({ ...prev, inProgress: true, error: null }));

      // Configure AI optimization parameters based on campaign type
      const aiConfig = campaign?.type 
        ? AI_CONFIG.MODEL_DEFAULTS[campaign.type]
        : AI_CONFIG.LLM_SETTINGS;

      await dispatch(optimizeCampaign({ 
        id: campaignId,
        config: aiConfig
      }));

      setOptimization(prev => ({
        ...prev,
        inProgress: false,
        lastOptimized: new Date(),
        score: metrics?.aiMetrics?.optimizationScore || 0
      }));
    } catch (err) {
      setOptimization(prev => ({
        ...prev,
        inProgress: false,
        error: err instanceof Error ? err.message : 'Optimization failed'
      }));
    }
  }, [campaignId, campaign?.type, dispatch, metrics?.aiMetrics?.optimizationScore]);

  /**
   * Initial data fetch
   */
  useEffect(() => {
    if (campaignId) {
      refresh();
    }
  }, [campaignId, refresh]);

  /**
   * Monitor campaign status for automatic optimization
   */
  useEffect(() => {
    if (
      campaign?.status === CampaignStatus.ACTIVE &&
      campaign?.config?.optimization?.enabled &&
      (!optimization.lastOptimized || 
        Date.now() - optimization.lastOptimized.getTime() > AI_CONFIG.LLM_SETTINGS.optimizationInterval)
    ) {
      optimize();
    }
  }, [campaign?.status, campaign?.config?.optimization?.enabled, optimization.lastOptimized, optimize]);

  return {
    campaign,
    loading,
    error,
    metrics,
    optimization,
    actions: {
      refresh,
      optimize,
      updateMetrics: debouncedMetricsUpdate
    }
  };
}