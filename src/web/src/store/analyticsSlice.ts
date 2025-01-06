/**
 * @fileoverview Redux slice for managing analytics state including metrics, dashboard data,
 * real-time updates, and performance monitoring using Redux Toolkit with WebSocket integration
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'; // v1.9.5
import { IAnalyticsMetric, IPerformanceMetric } from '../types/analytics';
import { AnalyticsService } from '../services/analytics.service';
import { ANALYTICS_CONFIG } from '../lib/constants';

// WebSocket connection status enum
enum WebSocketStatus {
  CONNECTING = 'CONNECTING',
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  ERROR = 'ERROR'
}

// Analytics state interface
interface AnalyticsState {
  dashboard: {
    metrics: IAnalyticsMetric[];
    charts: Record<string, any>;
    summary: {
      totalRevenue: number;
      conversionRate: number;
      activeLeads: number;
      aiEfficiency: number;
    };
  } | null;
  performanceMetrics: IPerformanceMetric[];
  socketStatus: WebSocketStatus;
  lastUpdated: number | null;
  loading: boolean;
  error: string | null;
  cacheValid: boolean;
}

// Constants
const CACHE_DURATION = 300000; // 5 minutes
const RECONNECT_INTERVAL = 5000; // 5 seconds

// Initialize analytics service
const analyticsService = new AnalyticsService();

// Initial state
const initialState: AnalyticsState = {
  dashboard: null,
  performanceMetrics: [],
  socketStatus: WebSocketStatus.DISCONNECTED,
  lastUpdated: null,
  loading: false,
  error: null,
  cacheValid: false
};

/**
 * Async thunk for fetching complete dashboard data with caching
 */
export const fetchDashboardData = createAsyncThunk(
  'analytics/fetchDashboard',
  async (filter: any, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { analytics: AnalyticsState };
      const now = Date.now();

      // Return cached data if valid
      if (
        state.analytics.dashboard &&
        state.analytics.lastUpdated &&
        now - state.analytics.lastUpdated < CACHE_DURATION &&
        state.analytics.cacheValid
      ) {
        return state.analytics.dashboard;
      }

      const dashboardData = await analyticsService.getDashboardData(filter);
      return dashboardData;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

/**
 * Async thunk for managing WebSocket subscription to real-time updates
 */
export const subscribeToUpdates = createAsyncThunk(
  'analytics/subscribe',
  async (_, { dispatch }) => {
    try {
      return await analyticsService.subscribeToUpdates((metrics) => {
        dispatch(updateMetrics(metrics));
      });
    } catch (error) {
      throw error;
    }
  }
);

/**
 * Async thunk for updating performance metrics with threshold monitoring
 */
export const updatePerformanceMetrics = createAsyncThunk(
  'analytics/performance',
  async (_, { rejectWithValue }) => {
    try {
      const metrics = await analyticsService.getPerformanceMetrics();
      
      // Check metrics against thresholds
      metrics.forEach(metric => {
        if (metric.value > metric.threshold) {
          window.dispatchEvent(new CustomEvent('analytics-alert', {
            detail: {
              metric: metric.name,
              value: metric.value,
              threshold: metric.threshold,
              timestamp: Date.now()
            }
          }));
        }
      });

      return metrics;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

/**
 * Analytics slice with reducers and actions
 */
const analyticsSlice = createSlice({
  name: 'analytics',
  initialState,
  reducers: {
    updateMetrics(state, action: PayloadAction<IAnalyticsMetric[]>) {
      if (state.dashboard) {
        state.dashboard.metrics = action.payload;
        state.lastUpdated = Date.now();
      }
    },
    updateSocketStatus(state, action: PayloadAction<WebSocketStatus>) {
      state.socketStatus = action.payload;
    },
    invalidateCache(state) {
      state.cacheValid = false;
    },
    clearError(state) {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Dashboard data fetching
      .addCase(fetchDashboardData.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchDashboardData.fulfilled, (state, action) => {
        state.dashboard = action.payload;
        state.lastUpdated = Date.now();
        state.loading = false;
        state.cacheValid = true;
        state.error = null;
      })
      .addCase(fetchDashboardData.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
        state.cacheValid = false;
      })
      // WebSocket subscription
      .addCase(subscribeToUpdates.pending, (state) => {
        state.socketStatus = WebSocketStatus.CONNECTING;
      })
      .addCase(subscribeToUpdates.fulfilled, (state) => {
        state.socketStatus = WebSocketStatus.CONNECTED;
      })
      .addCase(subscribeToUpdates.rejected, (state) => {
        state.socketStatus = WebSocketStatus.ERROR;
      })
      // Performance metrics
      .addCase(updatePerformanceMetrics.fulfilled, (state, action) => {
        state.performanceMetrics = action.payload;
      });
  }
});

// Export actions
export const {
  updateMetrics,
  updateSocketStatus,
  invalidateCache,
  clearError
} = analyticsSlice.actions;

// Selectors
export const selectDashboard = (state: { analytics: AnalyticsState }) => state.analytics.dashboard;
export const selectPerformanceMetrics = (state: { analytics: AnalyticsState }) => state.analytics.performanceMetrics;
export const selectSocketStatus = (state: { analytics: AnalyticsState }) => state.analytics.socketStatus;
export const selectLoading = (state: { analytics: AnalyticsState }) => state.analytics.loading;
export const selectError = (state: { analytics: AnalyticsState }) => state.analytics.error;

// Export reducer
export default analyticsSlice.reducer;