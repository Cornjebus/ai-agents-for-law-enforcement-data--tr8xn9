/**
 * @fileoverview Redux slice for managing voice call state with performance optimization
 * Implements geographic routing, real-time metrics, and AI-driven conversation handling
 * Version: 1.0.0
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'; // v1.9.5
import {
  IVoiceCall,
  VoiceCallStatus,
  IVoiceSynthesisOptions,
  VoiceCallMetrics,
  VoiceEngine,
  VoiceQuality,
  RoutingStrategy,
  IGeographicRouting
} from '../types/voice';
import { VoiceService } from '../services/voice.service';
import { ANALYTICS_CONFIG } from '../lib/constants';

// Performance thresholds
const VOICE_THRESHOLDS = {
  LATENCY: 200, // Maximum RTT in ms
  QUALITY: 0.85, // Minimum voice quality score
  JITTER: 30, // Maximum jitter in ms
};

// Interface for voice state with enhanced metrics
interface VoiceState {
  activeCalls: Record<string, IVoiceCall>;
  callMetrics: Record<string, VoiceCallMetrics>;
  aiMetrics: Record<string, AIConversationMetrics>;
  geographicRouting: Record<string, RegionLatencyMetrics>;
  loading: boolean;
  error: string | null;
}

// Interface for AI conversation metrics
interface AIConversationMetrics {
  responseTime: number;
  accuracy: number;
  confidenceScore: number;
  sentimentScore: number;
  lastOptimization: Date;
}

// Interface for region latency metrics
interface RegionLatencyMetrics {
  avgLatency: number;
  jitter: number;
  packetLoss: number;
  lastUpdated: Date;
  status: 'optimal' | 'degraded' | 'failing';
}

// Initial state with performance monitoring
const initialState: VoiceState = {
  activeCalls: {},
  callMetrics: {},
  aiMetrics: {},
  geographicRouting: {},
  loading: false,
  error: null,
};

// Voice service instance
const voiceService = new VoiceService();

/**
 * Async thunk for initiating a voice call with geographic routing optimization
 */
export const initiateCall = createAsyncThunk(
  'voice/initiateCall',
  async ({ phoneNumber, campaignId, region }: {
    phoneNumber: string;
    campaignId: string;
    region?: string;
  }) => {
    const voiceOptions: Partial<IVoiceSynthesisOptions> = {
      engine: VoiceEngine.NEURAL,
      quality: VoiceQuality.HIGH,
      region
    };

    const call = await voiceService.initiateCall(phoneNumber, campaignId, voiceOptions);
    return call;
  }
);

/**
 * Async thunk for updating call metrics with performance optimization
 */
export const updateCallMetrics = createAsyncThunk(
  'voice/updateMetrics',
  async (callId: string) => {
    const metrics = await voiceService.monitorCallPerformance(callId);
    return { callId, metrics };
  }
);

/**
 * Async thunk for optimizing geographic routing
 */
export const optimizeRouting = createAsyncThunk(
  'voice/optimizeRouting',
  async (region: string) => {
    const routingConfig: Partial<IGeographicRouting> = {
      region,
      routingStrategy: RoutingStrategy.LOWEST_LATENCY
    };
    await voiceService.configureGeographicRouting(routingConfig);
    return routingConfig;
  }
);

/**
 * Voice slice with enhanced performance management
 */
const voiceSlice = createSlice({
  name: 'voice',
  initialState,
  reducers: {
    setCallStatus: (state, action: PayloadAction<{ callId: string; status: VoiceCallStatus }>) => {
      const { callId, status } = action.payload;
      if (state.activeCalls[callId]) {
        state.activeCalls[callId].status = status;
      }
    },
    updateAIMetrics: (state, action: PayloadAction<{ callId: string; metrics: AIConversationMetrics }>) => {
      const { callId, metrics } = action.payload;
      state.aiMetrics[callId] = metrics;
    },
    updateRegionMetrics: (state, action: PayloadAction<{ region: string; metrics: RegionLatencyMetrics }>) => {
      const { region, metrics } = action.payload;
      state.geographicRouting[region] = metrics;
    },
    clearCallData: (state, action: PayloadAction<string>) => {
      const callId = action.payload;
      delete state.activeCalls[callId];
      delete state.callMetrics[callId];
      delete state.aiMetrics[callId];
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(initiateCall.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(initiateCall.fulfilled, (state, action) => {
        state.loading = false;
        state.activeCalls[action.payload.id] = action.payload;
      })
      .addCase(initiateCall.rejected, (state, action) => {
        state.loading = false;
        state.error = action.error.message || 'Failed to initiate call';
      })
      .addCase(updateCallMetrics.fulfilled, (state, action) => {
        const { callId, metrics } = action.payload;
        state.callMetrics[callId] = metrics;

        // Check performance thresholds
        const latency = metrics.latency[metrics.latency.length - 1]?.value;
        if (latency > VOICE_THRESHOLDS.LATENCY) {
          // Trigger optimization if needed
          const currentRegion = state.activeCalls[callId]?.geographicRouting.region;
          if (currentRegion) {
            optimizeRouting(currentRegion);
          }
        }
      })
      .addCase(optimizeRouting.fulfilled, (state, action) => {
        const { region } = action.payload;
        if (state.geographicRouting[region]) {
          state.geographicRouting[region].status = 'optimal';
          state.geographicRouting[region].lastUpdated = new Date();
        }
      });
  }
});

// Export actions and reducer
export const {
  setCallStatus,
  updateAIMetrics,
  updateRegionMetrics,
  clearCallData
} = voiceSlice.actions;

export default voiceSlice.reducer;

// Selectors with memoization
export const selectActiveCall = (state: { voice: VoiceState }, callId: string): IVoiceCall | undefined =>
  state.voice.activeCalls[callId];

export const selectCallMetrics = (state: { voice: VoiceState }, callId: string): VoiceCallMetrics | undefined =>
  state.voice.callMetrics[callId];

export const selectAIMetrics = (state: { voice: VoiceState }, callId: string): AIConversationMetrics | undefined =>
  state.voice.aiMetrics[callId];

export const selectOptimalRegion = (state: { voice: VoiceState }): string | undefined => {
  const regions = Object.entries(state.voice.geographicRouting);
  if (!regions.length) return undefined;

  return regions.reduce((optimal, [region, metrics]) => {
    if (!optimal || metrics.avgLatency < state.voice.geographicRouting[optimal].avgLatency) {
      return region;
    }
    return optimal;
  }, regions[0][0]);
};

export const selectVoiceState = (state: { voice: VoiceState }): VoiceState => state.voice;