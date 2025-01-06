/**
 * @fileoverview Root Redux store configuration implementing centralized state management
 * with real-time updates, performance optimization, and type-safe operations
 * @version 1.0.0
 */

import { configureStore, combineReducers } from '@reduxjs/toolkit'; // v1.9.5
import thunk from 'redux-thunk'; // v2.4.2

// Import feature reducers
import analyticsReducer from './analyticsSlice';
import authReducer from './authSlice';
import campaignReducer from './campaignSlice';
import contentReducer from './contentSlice';

// Real-time update middleware
const realTimeMiddleware = (store: any) => (next: any) => (action: any) => {
  const result = next(action);
  
  // Monitor specific actions for real-time updates
  if (action.type.startsWith('analytics/') || 
      action.type.startsWith('campaign/') ||
      action.type.startsWith('content/')) {
    window.dispatchEvent(new CustomEvent('store-update', {
      detail: {
        type: action.type,
        timestamp: Date.now()
      }
    }));
  }
  
  return result;
};

// Performance monitoring middleware
const performanceMiddleware = (store: any) => (next: any) => (action: any) => {
  const start = performance.now();
  const result = next(action);
  const duration = performance.now() - start;

  // Log performance metrics for actions taking longer than 100ms
  if (duration > 100) {
    console.warn(`Slow action detected: ${action.type} took ${duration.toFixed(2)}ms`);
    window.dispatchEvent(new CustomEvent('store-performance', {
      detail: {
        type: action.type,
        duration,
        timestamp: Date.now()
      }
    }));
  }

  return result;
};

// Combine reducers with type-safe configuration
const rootReducer = combineReducers({
  analytics: analyticsReducer,
  auth: authReducer,
  campaign: campaignReducer,
  content: contentReducer
});

// Configure store with middleware and development tools
const configureAppStore = () => {
  const store = configureStore({
    reducer: rootReducer,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware({
      serializableCheck: {
        // Ignore specific paths for non-serializable data
        ignoredActions: ['auth/login/fulfilled', 'content/generate/fulfilled'],
        ignoredPaths: ['auth.securityContext', 'content.aiStatus']
      },
      thunk: {
        extraArgument: {
          // Add any extra arguments for thunks here
        }
      }
    }).concat([
      thunk,
      realTimeMiddleware,
      performanceMiddleware
    ]),
    devTools: process.env.NODE_ENV !== 'production' && {
      name: 'Autonomous Revenue Generation Platform',
      trace: true,
      traceLimit: 25
    }
  });

  // Enable hot module replacement for reducers in development
  if (process.env.NODE_ENV !== 'production' && module.hot) {
    module.hot.accept([
      './analyticsSlice',
      './authSlice',
      './campaignSlice',
      './contentSlice'
    ], () => {
      store.replaceReducer(rootReducer);
    });
  }

  // Initialize performance monitoring
  if (process.env.NODE_ENV === 'production') {
    store.subscribe(() => {
      const state = store.getState();
      // Monitor store size
      const stateSize = new Blob([JSON.stringify(state)]).size;
      if (stateSize > 5 * 1024 * 1024) { // 5MB threshold
        console.warn('Redux store size exceeds 5MB:', stateSize);
      }
    });
  }

  return store;
};

// Create store instance
export const store = configureAppStore();

// Export type definitions
export type RootState = ReturnType<typeof rootReducer>;
export type AppDispatch = typeof store.dispatch;

// Export store instance as default
export default store;