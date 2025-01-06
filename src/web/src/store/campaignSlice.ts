/**
 * @fileoverview Redux slice for managing campaign state with real-time updates and optimizations
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, createSelector, PayloadAction } from '@reduxjs/toolkit';
import { ICampaign, ICampaignMetrics, CampaignStatus } from '../types/campaign';
import { campaignService } from '../services/campaign.service';
import { handleApiError } from '../lib/api';

// State interface for campaign management
interface CampaignState {
  campaigns: Record<string, ICampaign>;
  loading: boolean;
  error: string | null;
  selectedCampaignId: string | null;
  optimizationStatus: Record<string, {
    inProgress: boolean;
    lastOptimized: Date | null;
    error: string | null;
  }>;
  filters: {
    status?: CampaignStatus[];
    dateRange?: { start: Date; end: Date };
  };
  metrics: {
    lastUpdate: Date | null;
    updateInterval: number;
  };
}

// Initial state
const initialState: CampaignState = {
  campaigns: {},
  loading: false,
  error: null,
  selectedCampaignId: null,
  optimizationStatus: {},
  filters: {},
  metrics: {
    lastUpdate: null,
    updateInterval: 30000 // 30 seconds default
  }
};

// Async thunks for campaign operations
export const fetchCampaigns = createAsyncThunk(
  'campaigns/fetchCampaigns',
  async (filters?: CampaignState['filters'], { rejectWithValue }) => {
    try {
      const campaigns = await campaignService.getCampaigns(filters);
      return campaigns;
    } catch (error) {
      return rejectWithValue(handleApiError(error));
    }
  }
);

export const createCampaign = createAsyncThunk(
  'campaigns/createCampaign',
  async (campaign: Omit<ICampaign, 'id'>, { rejectWithValue }) => {
    try {
      const newCampaign = await campaignService.createCampaign(campaign);
      return newCampaign;
    } catch (error) {
      return rejectWithValue(handleApiError(error));
    }
  }
);

export const updateCampaign = createAsyncThunk(
  'campaigns/updateCampaign',
  async ({ id, updates }: { id: string; updates: Partial<ICampaign> }, { rejectWithValue }) => {
    try {
      const updatedCampaign = await campaignService.updateCampaign(id, updates);
      return updatedCampaign;
    } catch (error) {
      return rejectWithValue(handleApiError(error));
    }
  }
);

export const optimizeCampaign = createAsyncThunk(
  'campaigns/optimizeCampaign',
  async (id: string, { rejectWithValue }) => {
    try {
      const optimizationResult = await campaignService.optimizeCampaign(id);
      return { id, ...optimizationResult };
    } catch (error) {
      return rejectWithValue(handleApiError(error));
    }
  }
);

// Campaign slice
const campaignSlice = createSlice({
  name: 'campaigns',
  initialState,
  reducers: {
    setSelectedCampaign(state, action: PayloadAction<string | null>) {
      state.selectedCampaignId = action.payload;
    },
    updateCampaignMetrics(state, action: PayloadAction<{ id: string; metrics: ICampaignMetrics }>) {
      const { id, metrics } = action.payload;
      if (state.campaigns[id]) {
        state.campaigns[id].metrics = metrics;
        state.metrics.lastUpdate = new Date();
      }
    },
    setFilters(state, action: PayloadAction<CampaignState['filters']>) {
      state.filters = action.payload;
    },
    clearError(state) {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Fetch campaigns
      .addCase(fetchCampaigns.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(fetchCampaigns.fulfilled, (state, action) => {
        state.loading = false;
        state.campaigns = action.payload.reduce((acc, campaign) => {
          acc[campaign.id] = campaign;
          return acc;
        }, {} as Record<string, ICampaign>);
      })
      .addCase(fetchCampaigns.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Create campaign
      .addCase(createCampaign.fulfilled, (state, action) => {
        state.campaigns[action.payload.id] = action.payload;
      })
      // Update campaign
      .addCase(updateCampaign.fulfilled, (state, action) => {
        state.campaigns[action.payload.id] = action.payload;
      })
      // Optimize campaign
      .addCase(optimizeCampaign.pending, (state, action) => {
        state.optimizationStatus[action.meta.arg] = {
          inProgress: true,
          lastOptimized: null,
          error: null
        };
      })
      .addCase(optimizeCampaign.fulfilled, (state, action) => {
        state.optimizationStatus[action.payload.id] = {
          inProgress: false,
          lastOptimized: new Date(),
          error: null
        };
      })
      .addCase(optimizeCampaign.rejected, (state, action) => {
        state.optimizationStatus[action.meta.arg] = {
          inProgress: false,
          lastOptimized: null,
          error: action.payload as string
        };
      });
  }
});

// Selectors
export const selectAllCampaigns = (state: { campaigns: CampaignState }) => 
  Object.values(state.campaigns.campaigns);

export const selectCampaignById = (id: string) => 
  createSelector(
    (state: { campaigns: CampaignState }) => state.campaigns.campaigns,
    (campaigns) => campaigns[id]
  );

export const selectCampaignMetrics = (id: string) =>
  createSelector(
    (state: { campaigns: CampaignState }) => state.campaigns.campaigns[id]?.metrics,
    (metrics) => metrics
  );

export const selectOptimizationStatus = (id: string) =>
  createSelector(
    (state: { campaigns: CampaignState }) => state.campaigns.optimizationStatus[id],
    (status) => status
  );

export const selectActiveCampaigns = createSelector(
  selectAllCampaigns,
  (campaigns) => campaigns.filter(campaign => campaign.status === CampaignStatus.ACTIVE)
);

// Export actions and reducer
export const { 
  setSelectedCampaign, 
  updateCampaignMetrics, 
  setFilters, 
  clearError 
} = campaignSlice.actions;

export default campaignSlice.reducer;