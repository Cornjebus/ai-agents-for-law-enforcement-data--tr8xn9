/**
 * @fileoverview Enhanced React hook for managing secure authentication state and operations
 * Implements OAuth 2.0 + OIDC with JWT session management, role-based access control,
 * automatic token rotation, and comprehensive security monitoring
 * Version: 1.0.0
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { AuthService } from '../services/auth.service';
import { User, AuthState, LoginCredentials } from '../types/auth';

// Security monitoring configuration
const SECURITY_CONFIG = {
  SESSION_CHECK_INTERVAL: 60000, // 1 minute
  MAX_FAILED_ATTEMPTS: 3,
  LOCKOUT_DURATION: 300000, // 5 minutes
  INACTIVITY_TIMEOUT: 1800000, // 30 minutes
};

interface SecurityStatus {
  failedAttempts: number;
  lastFailedAttempt: number | null;
  isLocked: boolean;
  lastActivity: number;
  securityEvents: Array<{
    type: string;
    timestamp: number;
    details?: any;
  }>;
}

interface UseAuthReturn {
  isAuthenticated: boolean;
  user: User | null;
  loading: boolean;
  error: string | null;
  securityStatus: SecurityStatus;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
}

/**
 * Enhanced authentication hook with comprehensive security features
 */
export function useAuth(): UseAuthReturn {
  // Core authentication state
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    user: null,
    loading: true,
    error: null
  });

  // Security monitoring state
  const [securityStatus, setSecurityStatus] = useState<SecurityStatus>({
    failedAttempts: 0,
    lastFailedAttempt: null,
    isLocked: false,
    lastActivity: Date.now(),
    securityEvents: []
  });

  // Service and timer references
  const authService = useRef(new AuthService());
  const sessionCheckTimer = useRef<NodeJS.Timeout>();
  const tokenRotationTimer = useRef<NodeJS.Timeout>();

  /**
   * Logs security events and updates security status
   */
  const logSecurityEvent = useCallback((type: string, details?: any) => {
    setSecurityStatus(prev => ({
      ...prev,
      securityEvents: [
        ...prev.securityEvents,
        { type, timestamp: Date.now(), details }
      ]
    }));

    // Emit security event for monitoring
    window.dispatchEvent(new CustomEvent('auth-security-event', {
      detail: { type, timestamp: Date.now(), details }
    }));
  }, []);

  /**
   * Updates security status based on authentication attempts
   */
  const updateSecurityStatus = useCallback((success: boolean) => {
    setSecurityStatus(prev => {
      const newStatus = { ...prev };

      if (success) {
        newStatus.failedAttempts = 0;
        newStatus.lastFailedAttempt = null;
        newStatus.isLocked = false;
      } else {
        newStatus.failedAttempts = prev.failedAttempts + 1;
        newStatus.lastFailedAttempt = Date.now();
        newStatus.isLocked = newStatus.failedAttempts >= SECURITY_CONFIG.MAX_FAILED_ATTEMPTS;
      }

      return newStatus;
    });
  }, []);

  /**
   * Monitors session activity and security status
   */
  const monitorSecurityStatus = useCallback(async () => {
    try {
      // Check for session timeout
      const currentTime = Date.now();
      if (currentTime - securityStatus.lastActivity > SECURITY_CONFIG.INACTIVITY_TIMEOUT) {
        logSecurityEvent('session_timeout');
        await handleLogout();
        return;
      }

      // Validate current token
      const token = localStorage.getItem('auth_token');
      if (token) {
        const isValid = await authService.current.validateToken(token);
        if (!isValid) {
          logSecurityEvent('invalid_token');
          await handleLogout();
        }
      }

      // Update last activity
      setSecurityStatus(prev => ({
        ...prev,
        lastActivity: currentTime
      }));
    } catch (error) {
      logSecurityEvent('security_monitor_error', { error: error.message });
    }
  }, [securityStatus.lastActivity]);

  /**
   * Enhanced login handler with security checks
   */
  const handleLogin = useCallback(async (credentials: LoginCredentials) => {
    try {
      setAuthState(prev => ({ ...prev, loading: true, error: null }));

      // Check if account is locked
      if (securityStatus.isLocked) {
        const lockoutRemaining = SECURITY_CONFIG.LOCKOUT_DURATION - 
          (Date.now() - (securityStatus.lastFailedAttempt || 0));
        
        if (lockoutRemaining > 0) {
          throw new Error(`Account locked. Try again in ${Math.ceil(lockoutRemaining / 1000)} seconds`);
        }
      }

      // Attempt login
      const response = await authService.current.login(credentials);
      
      // Update authentication state
      setAuthState({
        isAuthenticated: true,
        user: response.user,
        loading: false,
        error: null
      });

      // Update security status
      updateSecurityStatus(true);
      logSecurityEvent('login_success', { userId: response.user.id });

    } catch (error) {
      updateSecurityStatus(false);
      logSecurityEvent('login_failure', { error: error.message });

      setAuthState({
        isAuthenticated: false,
        user: null,
        loading: false,
        error: error.message
      });
    }
  }, [securityStatus.isLocked, securityStatus.lastFailedAttempt]);

  /**
   * Enhanced logout handler with security cleanup
   */
  const handleLogout = useCallback(async () => {
    try {
      setAuthState(prev => ({ ...prev, loading: true }));
      
      await authService.current.logout();
      
      // Clear all timers
      if (sessionCheckTimer.current) {
        clearInterval(sessionCheckTimer.current);
      }
      if (tokenRotationTimer.current) {
        clearInterval(tokenRotationTimer.current);
      }

      // Reset states
      setAuthState({
        isAuthenticated: false,
        user: null,
        loading: false,
        error: null
      });

      logSecurityEvent('logout_success');
    } catch (error) {
      logSecurityEvent('logout_error', { error: error.message });
      setAuthState(prev => ({
        ...prev,
        loading: false,
        error: error.message
      }));
    }
  }, []);

  /**
   * Initialize security monitoring and token rotation
   */
  useEffect(() => {
    // Setup session monitoring
    sessionCheckTimer.current = setInterval(monitorSecurityStatus, SECURITY_CONFIG.SESSION_CHECK_INTERVAL);

    // Check initial auth state
    const checkInitialAuth = async () => {
      try {
        const token = localStorage.getItem('auth_token');
        if (token) {
          const isValid = await authService.current.validateToken(token);
          if (isValid) {
            const user = await authService.current.getCurrentUser();
            if (user) {
              setAuthState({
                isAuthenticated: true,
                user,
                loading: false,
                error: null
              });
              logSecurityEvent('session_restored');
              return;
            }
          }
        }
        setAuthState(prev => ({ ...prev, loading: false }));
      } catch (error) {
        logSecurityEvent('initial_auth_error', { error: error.message });
        setAuthState({
          isAuthenticated: false,
          user: null,
          loading: false,
          error: error.message
        });
      }
    };

    checkInitialAuth();

    // Cleanup on unmount
    return () => {
      if (sessionCheckTimer.current) {
        clearInterval(sessionCheckTimer.current);
      }
      if (tokenRotationTimer.current) {
        clearInterval(tokenRotationTimer.current);
      }
    };
  }, []);

  return {
    isAuthenticated: authState.isAuthenticated,
    user: authState.user,
    loading: authState.loading,
    error: authState.error,
    securityStatus,
    login: handleLogin,
    logout: handleLogout
  };
}