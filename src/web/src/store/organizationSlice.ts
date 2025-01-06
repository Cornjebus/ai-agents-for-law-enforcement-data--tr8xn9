/**
 * @fileoverview Redux slice for managing organization state with real-time updates
 * and role-based access control
 * @version 1.0.0
 */

import { createSlice, createAsyncThunk, createSelector } from '@reduxjs/toolkit'; // v1.9.5
import { Organization, OrganizationMember } from '../types/organization';
import { OrganizationService } from '../services/organization.service';

// Initialize organization service singleton
const organizationService = new OrganizationService();

/**
 * Enhanced interface for organization slice state with real-time updates support
 */
interface OrganizationState {
  organization: Organization | null;
  members: Record<string, OrganizationMember>;
  loading: Record<string, boolean>;
  error: Record<string, string | null>;
  syncStatus: {
    lastSync: number;
    connected: boolean;
  };
}

/**
 * Initial state with granular loading and error tracking
 */
const initialState: OrganizationState = {
  organization: null,
  members: {},
  loading: {
    fetchOrganization: false,
    updateSettings: false,
    updateAIConfig: false,
    fetchMembers: false
  },
  error: {
    fetchOrganization: null,
    updateSettings: null,
    updateAIConfig: null,
    fetchMembers: null
  },
  syncStatus: {
    lastSync: 0,
    connected: false
  }
};

/**
 * Async thunk for fetching organization details with retry logic
 */
export const fetchOrganization = createAsyncThunk(
  'organization/fetch',
  async (organizationId: string, { rejectWithValue }) => {
    try {
      const organization = await organizationService.getOrganization(organizationId);
      return organization;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

/**
 * Async thunk for updating organization settings
 */
export const updateOrganizationSettings = createAsyncThunk(
  'organization/updateSettings',
  async ({ organizationId, settings }: { organizationId: string; settings: Organization['settings'] }, 
  { rejectWithValue }) => {
    try {
      const updated = await organizationService.updateSettings(organizationId, settings);
      return updated;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

/**
 * Async thunk for updating AI configuration
 */
export const updateOrganizationAIConfig = createAsyncThunk(
  'organization/updateAIConfig',
  async ({ organizationId, aiConfig }: { organizationId: string; aiConfig: Organization['aiConfig'] },
  { rejectWithValue }) => {
    try {
      const updated = await organizationService.updateAIConfig(organizationId, aiConfig);
      return updated;
    } catch (error) {
      return rejectWithValue(error.message);
    }
  }
);

/**
 * Organization slice with enhanced real-time capabilities
 */
const organizationSlice = createSlice({
  name: 'organization',
  initialState,
  reducers: {
    setOrganization: (state, action) => {
      state.organization = action.payload;
      state.syncStatus.lastSync = Date.now();
    },
    updateSyncStatus: (state, action) => {
      state.syncStatus = {
        ...state.syncStatus,
        ...action.payload
      };
    },
    clearOrganizationState: (state) => {
      return initialState;
    },
    // Optimistic update handlers
    optimisticUpdateSettings: (state, action) => {
      if (state.organization) {
        state.organization.settings = action.payload;
        state.syncStatus.lastSync = Date.now();
      }
    },
    optimisticUpdateAIConfig: (state, action) => {
      if (state.organization) {
        state.organization.aiConfig = action.payload;
        state.syncStatus.lastSync = Date.now();
      }
    }
  },
  extraReducers: (builder) => {
    // Fetch organization
    builder.addCase(fetchOrganization.pending, (state) => {
      state.loading.fetchOrganization = true;
      state.error.fetchOrganization = null;
    });
    builder.addCase(fetchOrganization.fulfilled, (state, action) => {
      state.organization = action.payload;
      state.loading.fetchOrganization = false;
      state.syncStatus.lastSync = Date.now();
    });
    builder.addCase(fetchOrganization.rejected, (state, action) => {
      state.loading.fetchOrganization = false;
      state.error.fetchOrganization = action.payload as string;
    });

    // Update settings
    builder.addCase(updateOrganizationSettings.pending, (state) => {
      state.loading.updateSettings = true;
      state.error.updateSettings = null;
    });
    builder.addCase(updateOrganizationSettings.fulfilled, (state, action) => {
      state.organization = action.payload;
      state.loading.updateSettings = false;
      state.syncStatus.lastSync = Date.now();
    });
    builder.addCase(updateOrganizationSettings.rejected, (state, action) => {
      state.loading.updateSettings = false;
      state.error.updateSettings = action.payload as string;
    });

    // Update AI config
    builder.addCase(updateOrganizationAIConfig.pending, (state) => {
      state.loading.updateAIConfig = true;
      state.error.updateAIConfig = null;
    });
    builder.addCase(updateOrganizationAIConfig.fulfilled, (state, action) => {
      state.organization = action.payload;
      state.loading.updateAIConfig = false;
      state.syncStatus.lastSync = Date.now();
    });
    builder.addCase(updateOrganizationAIConfig.rejected, (state, action) => {
      state.loading.updateAIConfig = false;
      state.error.updateAIConfig = action.payload as string;
    });
  }
});

// Export actions
export const {
  setOrganization,
  updateSyncStatus,
  clearOrganizationState,
  optimisticUpdateSettings,
  optimisticUpdateAIConfig
} = organizationSlice.actions;

// Memoized selectors
export const selectOrganization = (state: { organization: OrganizationState }) => 
  state.organization.organization;

export const selectOrganizationWithSync = createSelector(
  [(state: { organization: OrganizationState }) => state.organization],
  (organizationState) => ({
    organization: organizationState.organization,
    syncStatus: organizationState.syncStatus
  })
);

export const selectLoadingStates = (state: { organization: OrganizationState }) => 
  state.organization.loading;

export const selectErrorStates = (state: { organization: OrganizationState }) => 
  state.organization.error;

// Export reducer
export default organizationSlice.reducer;