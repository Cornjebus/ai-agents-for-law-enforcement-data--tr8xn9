/**
 * @fileoverview Enhanced authentication service implementing OAuth 2.0 + OIDC with JWT session management,
 * role-based access control, secure token rotation, and real-time authentication state management
 * Version: 1.0.0
 */

import { ApiClient } from '../lib/api';
import { User, LoginCredentials, AuthResponse } from '../types/auth';
import { setToken, clearAuth, rotateToken } from '../lib/auth';
import axios from 'axios'; // v1.4.0

// Authentication configuration constants
const AUTH_CONFIG = {
  TOKEN_REFRESH_THRESHOLD: 300, // 5 minutes in seconds
  SESSION_MONITOR_INTERVAL: 60000, // 1 minute in milliseconds
  MAX_RETRY_ATTEMPTS: 3,
  RATE_LIMIT_WINDOW: 60000, // 1 minute in milliseconds
  MAX_REQUESTS_PER_WINDOW: 10
};

/**
 * Enhanced authentication service with comprehensive security features
 */
export class AuthService {
  private apiClient: ApiClient;
  private tokenRotationTimer: NodeJS.Timeout | null = null;
  private sessionMonitorTimer: NodeJS.Timeout | null = null;
  private requestCount: number = 0;
  private rateLimitResetTime: number = Date.now();

  constructor(apiClient: ApiClient) {
    this.apiClient = apiClient;
    this.initializeSessionMonitor();
  }

  /**
   * Initializes session monitoring for security tracking
   */
  private initializeSessionMonitor(): void {
    this.sessionMonitorTimer = setInterval(() => {
      try {
        const token = localStorage.getItem('auth_token');
        if (token) {
          this.validateSession();
        }
      } catch (error) {
        this.handleSecurityEvent('session_monitor_error', { error: error.message });
      }
    }, AUTH_CONFIG.SESSION_MONITOR_INTERVAL);
  }

  /**
   * Validates current session security state
   */
  private async validateSession(): Promise<void> {
    try {
      const response = await this.apiClient.get('/auth/validate');
      if (!response.valid) {
        await this.logout();
        this.handleSecurityEvent('invalid_session', { reason: response.reason });
      }
    } catch (error) {
      this.handleSecurityEvent('session_validation_error', { error: error.message });
    }
  }

  /**
   * Implements rate limiting for security
   */
  private checkRateLimit(): boolean {
    const now = Date.now();
    if (now - this.rateLimitResetTime >= AUTH_CONFIG.RATE_LIMIT_WINDOW) {
      this.requestCount = 0;
      this.rateLimitResetTime = now;
    }

    if (this.requestCount >= AUTH_CONFIG.MAX_REQUESTS_PER_WINDOW) {
      this.handleSecurityEvent('rate_limit_exceeded', {
        window: AUTH_CONFIG.RATE_LIMIT_WINDOW,
        maxRequests: AUTH_CONFIG.MAX_REQUESTS_PER_WINDOW
      });
      return false;
    }

    this.requestCount++;
    return true;
  }

  /**
   * Handles security events and monitoring
   */
  private handleSecurityEvent(event: string, details: Record<string, any>): void {
    const securityEvent = {
      timestamp: new Date().toISOString(),
      event,
      details,
      userAgent: navigator.userAgent,
      location: window.location.href
    };

    window.dispatchEvent(new CustomEvent('auth-security-event', {
      detail: securityEvent
    }));
  }

  /**
   * Initiates token rotation schedule
   */
  private scheduleTokenRotation(expiresIn: number): void {
    if (this.tokenRotationTimer) {
      clearInterval(this.tokenRotationTimer);
    }

    const rotationTime = (expiresIn - AUTH_CONFIG.TOKEN_REFRESH_THRESHOLD) * 1000;
    this.tokenRotationTimer = setInterval(async () => {
      try {
        const currentToken = localStorage.getItem('auth_token');
        if (currentToken) {
          const newToken = await rotateToken(currentToken);
          await setToken(newToken);
          this.handleSecurityEvent('token_rotation_success', {
            rotationTime: new Date().toISOString()
          });
        }
      } catch (error) {
        this.handleSecurityEvent('token_rotation_error', { error: error.message });
        await this.logout();
      }
    }, rotationTime);
  }

  /**
   * Authenticates user with enhanced security measures
   */
  public async login(credentials: LoginCredentials): Promise<AuthResponse> {
    try {
      if (!this.checkRateLimit()) {
        throw new Error('Rate limit exceeded');
      }

      // Validate credentials
      if (!credentials.email || !credentials.password) {
        throw new Error('Invalid credentials');
      }

      const response = await this.apiClient.post<AuthResponse>('/auth/login', credentials);

      // Validate response
      if (!response || !response.accessToken || !response.user) {
        throw new Error('Invalid authentication response');
      }

      // Store authentication tokens securely
      await setToken(response.accessToken);
      this.scheduleTokenRotation(response.expiresIn);

      // Initialize session monitoring
      this.initializeSessionMonitor();

      this.handleSecurityEvent('login_success', {
        userId: response.user.id,
        timestamp: new Date().toISOString()
      });

      return response;
    } catch (error) {
      this.handleSecurityEvent('login_error', {
        error: error.message,
        timestamp: new Date().toISOString()
      });
      throw error;
    }
  }

  /**
   * Securely logs out user and cleans up session
   */
  public async logout(): Promise<void> {
    try {
      const token = localStorage.getItem('auth_token');
      if (token) {
        await this.apiClient.post('/auth/logout', { token });
      }

      // Clear timers
      if (this.tokenRotationTimer) {
        clearInterval(this.tokenRotationTimer);
        this.tokenRotationTimer = null;
      }
      if (this.sessionMonitorTimer) {
        clearInterval(this.sessionMonitorTimer);
        this.sessionMonitorTimer = null;
      }

      // Clear authentication state
      await clearAuth();

      this.handleSecurityEvent('logout_success', {
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      this.handleSecurityEvent('logout_error', { error: error.message });
      // Ensure cleanup even if API call fails
      await clearAuth();
    }
  }

  /**
   * Retrieves current authenticated user with security validation
   */
  public async getCurrentUser(): Promise<User | null> {
    try {
      if (!this.checkRateLimit()) {
        throw new Error('Rate limit exceeded');
      }

      const token = localStorage.getItem('auth_token');
      if (!token) {
        return null;
      }

      const response = await this.apiClient.get<User>('/auth/me');
      
      this.handleSecurityEvent('user_fetch_success', {
        userId: response.id,
        timestamp: new Date().toISOString()
      });

      return response;
    } catch (error) {
      this.handleSecurityEvent('user_fetch_error', { error: error.message });
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        await this.logout();
      }
      return null;
    }
  }

  /**
   * Refreshes authentication token with security checks
   */
  public async refreshToken(refreshToken: string): Promise<AuthResponse> {
    try {
      if (!this.checkRateLimit()) {
        throw new Error('Rate limit exceeded');
      }

      const response = await this.apiClient.post<AuthResponse>('/auth/refresh', {
        refreshToken
      });

      await setToken(response.accessToken);
      this.scheduleTokenRotation(response.expiresIn);

      this.handleSecurityEvent('token_refresh_success', {
        userId: response.user.id,
        timestamp: new Date().toISOString()
      });

      return response;
    } catch (error) {
      this.handleSecurityEvent('token_refresh_error', { error: error.message });
      await this.logout();
      throw error;
    }
  }
}