/**
 * @fileoverview Enhanced Redux slice for lead management with real-time updates and AI scoring
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, createSelector, PayloadAction } from '@reduxjs/toolkit';
import { ILead, LeadStatus, IAIScore } from '../types/lead';

// State interface with enhanced caching and real-time features
interface LeadState {
  leads: ILead[];
  selectedLead: ILead | null;
  total: number;
  loading: {
    fetch: boolean;
    update: boolean;
    sync: boolean;
  };
  error: string | null;
  filters: {
    status?: LeadStatus[];
    search?: string;
    scoreRange?: {
      min: number;
      max: number;
    };
  };
  pagination: {
    page: number;
    limit: number;
  };
  aiScoring: {
    lastSync: Date | null;
    processing: boolean;
  };
  realTimeUpdates: {
    connected: boolean;
    lastSync: Date | null;
  };
  cache: {
    timestamp: Date | null;
    invalidated: boolean;
  };
}

// Initial state with performance optimization defaults
const initialState: LeadState = {
  leads: [],
  selectedLead: null,
  total: 0,
  loading: {
    fetch: false,
    update: false,
    sync: false
  },
  error: null,
  filters: {},
  pagination: {
    page: 1,
    limit: 10
  },
  aiScoring: {
    lastSync: null,
    processing: false
  },
  realTimeUpdates: {
    connected: false,
    lastSync: null
  },
  cache: {
    timestamp: null,
    invalidated: false
  }
};

// Async thunk for batch updating leads with optimistic updates
export const batchUpdateLeads = createAsyncThunk(
  'leads/batchUpdate',
  async (updates: Array<{ id: string; updates: Partial<ILead> }>, { rejectWithValue }) => {
    try {
      const response = await fetch('/api/v1/leads/batch', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ updates })
      });

      if (!response.ok) throw new Error('Batch update failed');
      return await response.json();
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

// Async thunk for syncing AI-generated lead scores
export const syncLeadScores = createAsyncThunk(
  'leads/syncScores',
  async (leadIds: string[], { rejectWithValue }) => {
    try {
      const response = await fetch('/api/v1/leads/scores/sync', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ leadIds })
      });

      if (!response.ok) throw new Error('Score sync failed');
      return await response.json();
    } catch (error) {
      return rejectWithValue((error as Error).message);
    }
  }
);

// Enhanced lead slice with real-time and AI capabilities
export const leadSlice = createSlice({
  name: 'leads',
  initialState,
  reducers: {
    setLeads: (state, action: PayloadAction<ILead[]>) => {
      state.leads = action.payload;
      state.cache.timestamp = new Date();
      state.cache.invalidated = false;
    },
    updateLead: (state, action: PayloadAction<Partial<ILead> & { id: string }>) => {
      const index = state.leads.findIndex(lead => lead.id === action.payload.id);
      if (index !== -1) {
        state.leads[index] = { ...state.leads[index], ...action.payload };
        state.cache.invalidated = true;
      }
    },
    setFilters: (state, action: PayloadAction<typeof state.filters>) => {
      state.filters = action.payload;
      state.pagination.page = 1;
    },
    setPagination: (state, action: PayloadAction<typeof state.pagination>) => {
      state.pagination = action.payload;
    },
    setSelectedLead: (state, action: PayloadAction<ILead | null>) => {
      state.selectedLead = action.payload;
    },
    updateAIScore: (state, action: PayloadAction<{ id: string; score: IAIScore }>) => {
      const lead = state.leads.find(lead => lead.id === action.payload.id);
      if (lead) {
        lead.aiScore = action.payload.score;
      }
    },
    setWebSocketConnection: (state, action: PayloadAction<boolean>) => {
      state.realTimeUpdates.connected = action.payload;
      state.realTimeUpdates.lastSync = new Date();
    }
  },
  extraReducers: (builder) => {
    // Batch update reducers
    builder.addCase(batchUpdateLeads.pending, (state) => {
      state.loading.update = true;
      state.error = null;
    });
    builder.addCase(batchUpdateLeads.fulfilled, (state, action) => {
      state.loading.update = false;
      action.payload.forEach((updatedLead: ILead) => {
        const index = state.leads.findIndex(lead => lead.id === updatedLead.id);
        if (index !== -1) {
          state.leads[index] = updatedLead;
        }
      });
      state.cache.invalidated = true;
    });
    builder.addCase(batchUpdateLeads.rejected, (state, action) => {
      state.loading.update = false;
      state.error = action.payload as string;
    });

    // AI score sync reducers
    builder.addCase(syncLeadScores.pending, (state) => {
      state.aiScoring.processing = true;
      state.error = null;
    });
    builder.addCase(syncLeadScores.fulfilled, (state, action) => {
      state.aiScoring.processing = false;
      state.aiScoring.lastSync = new Date();
      action.payload.forEach(({ id, score }: { id: string; score: IAIScore }) => {
        const lead = state.leads.find(lead => lead.id === id);
        if (lead) {
          lead.aiScore = score;
        }
      });
    });
    builder.addCase(syncLeadScores.rejected, (state, action) => {
      state.aiScoring.processing = false;
      state.error = action.payload as string;
    });
  }
});

// Memoized selectors for optimized performance
export const selectFilteredLeads = createSelector(
  [(state: { leads: LeadState }) => state.leads.leads, 
   (state: { leads: LeadState }) => state.leads.filters],
  (leads, filters) => {
    let filtered = [...leads];

    if (filters.status?.length) {
      filtered = filtered.filter(lead => filters.status?.includes(lead.status));
    }

    if (filters.search) {
      const search = filters.search.toLowerCase();
      filtered = filtered.filter(lead => 
        lead.firstName.toLowerCase().includes(search) ||
        lead.lastName.toLowerCase().includes(search) ||
        lead.company.toLowerCase().includes(search)
      );
    }

    if (filters.scoreRange) {
      filtered = filtered.filter(lead => 
        lead.aiScore.overall >= (filters.scoreRange?.min || 0) &&
        lead.aiScore.overall <= (filters.scoreRange?.max || 100)
      );
    }

    return filtered;
  }
);

export const { 
  setLeads, 
  updateLead, 
  setFilters, 
  setPagination, 
  setSelectedLead,
  updateAIScore,
  setWebSocketConnection 
} = leadSlice.actions;

export default leadSlice.reducer;