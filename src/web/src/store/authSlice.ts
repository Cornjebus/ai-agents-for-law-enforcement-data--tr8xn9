/**
 * @fileoverview Enhanced Redux slice for authentication state management
 * Implements OAuth 2.0 + OIDC with JWT session management, MFA support,
 * and comprehensive security monitoring
 * Version: 1.0.0
 */

import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit'; // v1.9.5
import { User, AuthState } from '../types/auth';
import { TokenManager } from '../lib/auth';

// Security monitoring constants
const TOKEN_ROTATION_INTERVAL = 3600; // 1 hour in seconds
const INACTIVITY_TIMEOUT = 1800; // 30 minutes in seconds
const SUSPICIOUS_LOGIN_THRESHOLD = 3;

/**
 * Enhanced initial state with security context
 */
const initialState: AuthState & {
  securityContext: {
    mfaEnabled: boolean;
    lastActivity: number | null;
    deviceFingerprint: string | null;
    sessionMonitoring: boolean;
  };
  permissionCache: {
    [key: string]: {
      permissions: string[];
      timestamp: number;
    } | null;
  };
  tokenRotation: {
    lastRotation: number | null;
    rotationDue: boolean;
  };
} = {
  isAuthenticated: false,
  user: null,
  loading: false,
  error: null,
  securityContext: {
    mfaEnabled: false,
    lastActivity: null,
    deviceFingerprint: null,
    sessionMonitoring: false
  },
  permissionCache: {},
  tokenRotation: {
    lastRotation: null,
    rotationDue: false
  }
};

/**
 * Enhanced login thunk with MFA and security monitoring
 */
export const loginThunk = createAsyncThunk(
  'auth/login',
  async (credentials: { email: string; password: string; mfaCode?: string }, { rejectWithValue }) => {
    try {
      // Initialize security monitoring
      const deviceFingerprint = await generateDeviceFingerprint();
      const loginAttempts = await getLoginAttempts(credentials.email);

      // Check for suspicious activity
      if (loginAttempts >= SUSPICIOUS_LOGIN_THRESHOLD) {
        throw new Error('SUSPICIOUS_ACTIVITY');
      }

      // Perform login
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...credentials, deviceFingerprint })
      });

      if (!response.ok) {
        const error = await response.json();
        if (error.mfaRequired) {
          return rejectWithValue({ code: 'MFA_REQUIRED' });
        }
        throw new Error(error.message);
      }

      const { user, tokens } = await response.json();

      // Initialize token rotation
      await TokenManager.rotateToken(tokens.accessToken);

      // Cache user permissions
      await cacheUserPermissions(user.id);

      // Log security event
      logSecurityEvent('LOGIN_SUCCESS', {
        userId: user.id,
        deviceFingerprint,
        mfaUsed: !!credentials.mfaCode
      });

      return user;
    } catch (error) {
      logSecurityEvent('LOGIN_FAILURE', {
        email: credentials.email,
        error: error.message
      });
      return rejectWithValue(error.message);
    }
  }
);

/**
 * Enhanced logout thunk with security cleanup
 */
export const logoutThunk = createAsyncThunk(
  'auth/logout',
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: AuthState };
      
      // Log security event before logout
      if (state.auth.user) {
        logSecurityEvent('LOGOUT', {
          userId: state.auth.user.id,
          sessionDuration: Date.now() - (state.auth.securityContext.lastActivity || Date.now())
        });
      }

      // Perform logout
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      });

      // Clear security context
      await clearSecurityContext();
      
      return;
    } catch (error) {
      logSecurityEvent('LOGOUT_FAILURE', { error: error.message });
      return rejectWithValue(error.message);
    }
  }
);

/**
 * Enhanced token refresh thunk with rotation policy
 */
export const refreshTokenThunk = createAsyncThunk(
  'auth/refreshToken',
  async (_, { getState, rejectWithValue }) => {
    try {
      const state = getState() as { auth: AuthState };
      
      // Check token rotation policy
      const shouldRotate = await checkTokenRotationPolicy();
      
      if (shouldRotate) {
        const newToken = await TokenManager.rotateToken(state.auth.accessToken);
        
        logSecurityEvent('TOKEN_ROTATION', {
          userId: state.auth.user?.id,
          rotationReason: 'POLICY'
        });
        
        return { accessToken: newToken };
      }
      
      return null;
    } catch (error) {
      logSecurityEvent('TOKEN_REFRESH_FAILURE', { error: error.message });
      return rejectWithValue(error.message);
    }
  }
);

/**
 * Enhanced auth slice with security features
 */
const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    updateSecurityContext: (state, action: PayloadAction<Partial<typeof initialState.securityContext>>) => {
      state.securityContext = {
        ...state.securityContext,
        ...action.payload,
        lastActivity: Date.now()
      };
    },
    clearPermissionCache: (state) => {
      state.permissionCache = {};
    },
    setTokenRotationDue: (state, action: PayloadAction<boolean>) => {
      state.tokenRotation.rotationDue = action.payload;
    }
  },
  extraReducers: (builder) => {
    builder
      .addCase(loginThunk.pending, (state) => {
        state.loading = true;
        state.error = null;
      })
      .addCase(loginThunk.fulfilled, (state, action) => {
        state.isAuthenticated = true;
        state.user = action.payload;
        state.loading = false;
        state.error = null;
        state.securityContext = {
          ...state.securityContext,
          lastActivity: Date.now(),
          sessionMonitoring: true
        };
      })
      .addCase(loginThunk.rejected, (state, action) => {
        state.loading = false;
        state.error = action.payload as string;
      })
      .addCase(logoutThunk.fulfilled, (state) => {
        return {
          ...initialState,
          securityContext: {
            ...initialState.securityContext,
            deviceFingerprint: state.securityContext.deviceFingerprint
          }
        };
      })
      .addCase(refreshTokenThunk.fulfilled, (state, action) => {
        if (action.payload) {
          state.tokenRotation = {
            lastRotation: Date.now(),
            rotationDue: false
          };
        }
      });
  }
});

// Helper functions
async function generateDeviceFingerprint(): Promise<string> {
  // Implementation of device fingerprinting
  const components = [
    navigator.userAgent,
    navigator.language,
    screen.colorDepth,
    screen.pixelDepth,
    new Date().getTimezoneOffset()
  ];
  
  const fingerprint = components.join('|');
  return btoa(fingerprint);
}

async function getLoginAttempts(email: string): Promise<number> {
  // Implementation of login attempt tracking
  const response = await fetch(`/api/auth/attempts/${btoa(email)}`);
  const data = await response.json();
  return data.attempts;
}

async function cacheUserPermissions(userId: string): Promise<void> {
  // Implementation of permission caching
  const response = await fetch(`/api/auth/permissions/${userId}`);
  const permissions = await response.json();
  
  authSlice.actions.updateSecurityContext({
    permissionCache: {
      [userId]: {
        permissions,
        timestamp: Date.now()
      }
    }
  });
}

async function checkTokenRotationPolicy(): Promise<boolean> {
  // Implementation of token rotation policy
  const state = store.getState().auth;
  const lastRotation = state.tokenRotation.lastRotation;
  
  return !lastRotation || (Date.now() - lastRotation) >= TOKEN_ROTATION_INTERVAL * 1000;
}

function logSecurityEvent(event: string, details: Record<string, any>): void {
  // Implementation of security event logging
  const securityEvent = {
    timestamp: new Date().toISOString(),
    event,
    details,
    deviceFingerprint: initialState.securityContext.deviceFingerprint
  };
  
  fetch('/api/security/log', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(securityEvent)
  }).catch(console.error);
}

async function clearSecurityContext(): Promise<void> {
  // Implementation of security context cleanup
  await Promise.all([
    TokenManager.rotateToken(''), // Invalidate token
    fetch('/api/security/session', { method: 'DELETE' })
  ]);
}

export const { updateSecurityContext, clearPermissionCache, setTokenRotationDue } = authSlice.actions;
export default authSlice.reducer;