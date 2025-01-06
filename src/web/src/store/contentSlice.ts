/**
 * @fileoverview Redux slice for managing content state with AI-driven content creation
 * and multi-platform distribution capabilities
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, createSelector, PayloadAction } from '@reduxjs/toolkit'; // v1.9.5
import { Content, ContentType, ContentPlatform, ContentStatus, ContentMetrics } from '../types/content';
import { ContentService } from '../services/content.service';
import { handleApiError } from '../lib/api';
import { ANALYTICS_CONFIG } from '../lib/constants';

// Interfaces for enhanced state management
interface AIGenerationStatus {
  progress: number;
  status: 'idle' | 'generating' | 'optimizing' | 'completed' | 'failed';
  error?: string;
  modelMetrics?: {
    confidenceScore: number;
    generationTime: number;
    tokenCount: number;
  };
}

interface DistributionStatus {
  platform: ContentPlatform;
  status: 'pending' | 'scheduled' | 'published' | 'failed';
  scheduledFor?: Date;
  error?: string;
}

interface ContentState {
  items: Record<string, Content>;
  activeIds: string[];
  loading: boolean;
  error: string | null;
  metrics: Record<string, ContentMetrics>;
  aiStatus: Record<string, AIGenerationStatus>;
  distributionStatus: Record<string, DistributionStatus>;
  lastUpdated: number;
}

// Initial state
const initialState: ContentState = {
  items: {},
  activeIds: [],
  loading: false,
  error: null,
  metrics: {},
  aiStatus: {},
  distributionStatus: {},
  lastUpdated: Date.now()
};

// Async thunks for content operations
export const createContent = createAsyncThunk(
  'content/create',
  async ({ content, aiOptions }: { content: Partial<Content>, aiOptions?: any }, { rejectWithValue }) => {
    try {
      const contentService = new ContentService();
      const result = await contentService.createContent(content);
      return result;
    } catch (error) {
      return rejectWithValue(handleApiError(error));
    }
  }
);

export const generateContent = createAsyncThunk(
  'content/generate',
  async ({ contentId, metadata }: { contentId: string, metadata: any }, { dispatch, getState, rejectWithValue }) => {
    try {
      const contentService = new ContentService();
      
      // Update AI generation status
      dispatch(contentSlice.actions.updateAIStatus({
        contentId,
        status: { status: 'generating', progress: 0 }
      }));

      // Optimize AI parameters
      const optimizedParams = await contentService.optimizeAIGeneration(metadata);
      
      // Generate content with optimized parameters
      const result = await contentService.generateContent(metadata, optimizedParams);
      
      // Update metrics
      dispatch(fetchContentMetrics(contentId));
      
      return result;
    } catch (error) {
      return rejectWithValue(handleApiError(error));
    }
  }
);

export const distributeContent = createAsyncThunk(
  'content/distribute',
  async ({ contentId, platforms }: { contentId: string, platforms: ContentPlatform[] }, { dispatch, rejectWithValue }) => {
    try {
      const contentService = new ContentService();
      
      // Update distribution status for each platform
      platforms.forEach(platform => {
        dispatch(contentSlice.actions.updateDistributionStatus({
          contentId,
          status: { platform, status: 'pending' }
        }));
      });

      await contentService.distributeContent(contentId, { platforms });
      return { contentId, platforms };
    } catch (error) {
      return rejectWithValue(handleApiError(error));
    }
  }
);

export const fetchContentMetrics = createAsyncThunk(
  'content/fetchMetrics',
  async (contentId: string, { rejectWithValue }) => {
    try {
      const contentService = new ContentService();
      const metrics = await contentService.getContentMetrics(contentId, {
        start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // Last 30 days
        end: new Date()
      });
      return { contentId, metrics };
    } catch (error) {
      return rejectWithValue(handleApiError(error));
    }
  }
);

// Create the slice
const contentSlice = createSlice({
  name: 'content',
  initialState,
  reducers: {
    updateAIStatus(state, action: PayloadAction<{ contentId: string, status: Partial<AIGenerationStatus> }>) {
      const { contentId, status } = action.payload;
      state.aiStatus[contentId] = {
        ...state.aiStatus[contentId],
        ...status
      };
    },
    updateDistributionStatus(state, action: PayloadAction<{ contentId: string, status: Partial<DistributionStatus> }>) {
      const { contentId, status } = action.payload;
      state.distributionStatus[contentId] = {
        ...state.distributionStatus[contentId],
        ...status
      };
    },
    clearError(state) {
      state.error = null;
    }
  },
  extraReducers: (builder) => {
    builder
      // Create content
      .addCase(createContent.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(createContent.fulfilled, (state, action) => {
        state.items[action.payload.id] = action.payload;
        state.activeIds.push(action.payload.id);
        state.loading = false;
        state.lastUpdated = Date.now();
      })
      .addCase(createContent.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      // Generate content
      .addCase(generateContent.fulfilled, (state, action) => {
        const content = action.payload;
        state.items[content.id] = content;
        state.aiStatus[content.id] = {
          status: 'completed',
          progress: 100,
          modelMetrics: {
            confidenceScore: content.metrics.aiPerformance[0].confidenceScore,
            generationTime: content.metrics.aiPerformance[0].generationTime,
            tokenCount: content.metrics.aiPerformance[0].tokenCount
          }
        };
        state.lastUpdated = Date.now();
      })
      // Distribute content
      .addCase(distributeContent.fulfilled, (state, action) => {
        const { contentId, platforms } = action.payload;
        platforms.forEach(platform => {
          state.distributionStatus[contentId] = {
            platform,
            status: 'published',
            scheduledFor: new Date()
          };
        });
        state.lastUpdated = Date.now();
      })
      // Fetch metrics
      .addCase(fetchContentMetrics.fulfilled, (state, action) => {
        const { contentId, metrics } = action.payload;
        state.metrics[contentId] = metrics;
        state.lastUpdated = Date.now();
      });
  }
});

// Selectors
export const selectAllContent = (state: { content: ContentState }) => state.content.items;
export const selectContentById = (state: { content: ContentState }, id: string) => state.content.items[id];

export const selectContentByPlatform = createSelector(
  [selectAllContent, (_state: { content: ContentState }, platform: ContentPlatform) => platform],
  (content, platform) => Object.values(content).filter(item => item.platform === platform)
);

export const selectContentMetrics = createSelector(
  [selectAllContent, (state: { content: ContentState }) => state.content.metrics],
  (content, metrics) => {
    return Object.keys(content).reduce((acc, id) => ({
      ...acc,
      [id]: metrics[id] || null
    }), {});
  }
);

export const selectAIGenerationStatus = createSelector(
  [(state: { content: ContentState }) => state.content.aiStatus],
  (aiStatus) => aiStatus
);

// Export actions and reducer
export const { updateAIStatus, updateDistributionStatus, clearError } = contentSlice.actions;
export default contentSlice.reducer;