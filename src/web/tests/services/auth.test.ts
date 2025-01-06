/**
 * @fileoverview Comprehensive test suite for AuthService validating OAuth2/OIDC implementation,
 * token security, RBAC, and session management with enhanced security testing coverage
 * Version: 1.0.0
 */

import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals'; // v29.6.0
import { setupServer } from 'msw/node'; // v1.2.2
import { rest } from 'msw'; // v1.2.2
import { AES } from 'crypto-js'; // v4.1.1
import { AuthService } from '../../src/services/auth.service';
import { User, LoginCredentials, AuthResponse, UserRole } from '../../src/types/auth';
import { ApiClient } from '../../src/lib/api';

// Mock API client
jest.mock('../../src/lib/api');

// Test data constants
const TEST_USER: User = {
  id: 'test-user-id',
  email: 'test@example.com',
  role: UserRole.MANAGER,
  firstName: 'Test',
  lastName: 'User',
  organizationId: 'test-org',
  createdAt: new Date(),
  lastLoginAt: new Date()
};

const TEST_CREDENTIALS: LoginCredentials = {
  email: 'test@example.com',
  password: 'Test123!@#',
  rememberMe: true
};

const TEST_AUTH_RESPONSE: AuthResponse = {
  user: TEST_USER,
  accessToken: 'test-access-token',
  refreshToken: 'test-refresh-token',
  expiresIn: 3600
};

// MSW server setup for API mocking
const server = setupServer(
  rest.post('/api/auth/login', (req, res, ctx) => {
    return res(ctx.json(TEST_AUTH_RESPONSE));
  }),
  rest.post('/api/auth/logout', (req, res, ctx) => {
    return res(ctx.status(200));
  }),
  rest.post('/api/auth/refresh', (req, res, ctx) => {
    return res(ctx.json({
      ...TEST_AUTH_RESPONSE,
      accessToken: 'new-access-token'
    }));
  }),
  rest.get('/api/auth/me', (req, res, ctx) => {
    return res(ctx.json(TEST_USER));
  })
);

describe('AuthService', () => {
  let authService: AuthService;
  let apiClient: jest.Mocked<ApiClient>;

  beforeEach(() => {
    // Clear localStorage and sessionStorage
    localStorage.clear();
    sessionStorage.clear();
    
    // Reset API client mock
    apiClient = new ApiClient() as jest.Mocked<ApiClient>;
    authService = new AuthService(apiClient);
    
    // Start MSW server
    server.listen();
  });

  afterEach(() => {
    server.close();
    jest.clearAllMocks();
  });

  describe('Authentication', () => {
    test('should successfully login with valid credentials', async () => {
      apiClient.post.mockResolvedValueOnce(TEST_AUTH_RESPONSE);

      const response = await authService.login(TEST_CREDENTIALS);

      expect(response).toEqual(TEST_AUTH_RESPONSE);
      expect(localStorage.getItem('auth_token')).toBeTruthy();
      expect(apiClient.post).toHaveBeenCalledWith('/auth/login', TEST_CREDENTIALS);
    });

    test('should handle MFA authentication flow', async () => {
      const mfaResponse = {
        status: 202,
        mfaToken: 'test-mfa-token',
        message: 'MFA required'
      };

      apiClient.post
        .mockResolvedValueOnce(mfaResponse)
        .mockResolvedValueOnce(TEST_AUTH_RESPONSE);

      // First call should trigger MFA
      await expect(authService.login(TEST_CREDENTIALS))
        .rejects.toThrow('MFA required');

      // Second call with MFA code should succeed
      const mfaCredentials = { ...TEST_CREDENTIALS, mfaCode: '123456' };
      const response = await authService.login(mfaCredentials);

      expect(response).toEqual(TEST_AUTH_RESPONSE);
    });

    test('should handle login failures gracefully', async () => {
      apiClient.post.mockRejectedValueOnce(new Error('Invalid credentials'));

      await expect(authService.login(TEST_CREDENTIALS))
        .rejects.toThrow('Invalid credentials');
      
      expect(localStorage.getItem('auth_token')).toBeFalsy();
    });

    test('should successfully logout and clean up session', async () => {
      apiClient.post.mockResolvedValueOnce({});
      
      await authService.logout();

      expect(localStorage.getItem('auth_token')).toBeFalsy();
      expect(apiClient.post).toHaveBeenCalledWith('/auth/logout', expect.any(Object));
    });
  });

  describe('Token Security', () => {
    test('should securely store and rotate tokens', async () => {
      apiClient.post.mockResolvedValueOnce(TEST_AUTH_RESPONSE);
      
      await authService.login(TEST_CREDENTIALS);
      const initialToken = localStorage.getItem('auth_token');

      // Mock token rotation
      jest.advanceTimersByTime(3600000); // 1 hour
      
      const newToken = localStorage.getItem('auth_token');
      expect(newToken).not.toEqual(initialToken);
    });

    test('should validate token integrity', async () => {
      apiClient.post.mockResolvedValueOnce(TEST_AUTH_RESPONSE);
      
      await authService.login(TEST_CREDENTIALS);
      const token = localStorage.getItem('auth_token');

      // Tamper with token
      localStorage.setItem('auth_token', 'tampered-token');

      await expect(authService.getCurrentUser())
        .rejects.toThrow('Invalid token');
    });

    test('should handle token refresh correctly', async () => {
      apiClient.post
        .mockResolvedValueOnce(TEST_AUTH_RESPONSE)
        .mockResolvedValueOnce({
          ...TEST_AUTH_RESPONSE,
          accessToken: 'refreshed-token'
        });

      await authService.login(TEST_CREDENTIALS);
      await authService.refreshToken(TEST_AUTH_RESPONSE.refreshToken);

      const newToken = localStorage.getItem('auth_token');
      expect(newToken).toContain('refreshed-token');
    });
  });

  describe('Authorization', () => {
    test('should enforce role-based access control', async () => {
      apiClient.post.mockResolvedValueOnce(TEST_AUTH_RESPONSE);
      
      await authService.login(TEST_CREDENTIALS);

      // Test RBAC checks
      expect(authService.hasPermission(UserRole.CONTENT_CREATOR)).toBeTruthy();
      expect(authService.hasPermission(UserRole.ADMIN)).toBeFalsy();
    });

    test('should handle permission inheritance correctly', async () => {
      const adminResponse = {
        ...TEST_AUTH_RESPONSE,
        user: { ...TEST_USER, role: UserRole.ADMIN }
      };

      apiClient.post.mockResolvedValueOnce(adminResponse);
      
      await authService.login(TEST_CREDENTIALS);

      // Admin should have access to all lower roles
      expect(authService.hasPermission(UserRole.MANAGER)).toBeTruthy();
      expect(authService.hasPermission(UserRole.CONTENT_CREATOR)).toBeTruthy();
      expect(authService.hasPermission(UserRole.ANALYST)).toBeTruthy();
    });

    test('should validate session security', async () => {
      apiClient.post.mockResolvedValueOnce(TEST_AUTH_RESPONSE);
      apiClient.get.mockResolvedValueOnce({ valid: true });
      
      await authService.login(TEST_CREDENTIALS);

      // Test session validation
      const sessionValid = await authService.validateSession();
      expect(sessionValid).toBeTruthy();
    });

    test('should handle session timeout', async () => {
      apiClient.post.mockResolvedValueOnce(TEST_AUTH_RESPONSE);
      
      await authService.login(TEST_CREDENTIALS);

      // Simulate session timeout
      jest.advanceTimersByTime(4 * 3600000); // 4 hours

      await expect(authService.getCurrentUser())
        .rejects.toThrow('Session expired');
    });
  });

  describe('Security Events', () => {
    test('should emit security events for monitoring', async () => {
      const securityEvents: any[] = [];
      window.addEventListener('auth-security-event', ((event: CustomEvent) => {
        securityEvents.push(event.detail);
      }) as EventListener);

      apiClient.post.mockResolvedValueOnce(TEST_AUTH_RESPONSE);
      
      await authService.login(TEST_CREDENTIALS);

      expect(securityEvents.length).toBeGreaterThan(0);
      expect(securityEvents[0].event).toBe('login_success');
    });

    test('should handle rate limiting', async () => {
      apiClient.post.mockResolvedValue(TEST_AUTH_RESPONSE);

      // Attempt multiple rapid requests
      const requests = Array(11).fill(null).map(() => 
        authService.login(TEST_CREDENTIALS)
      );

      await expect(Promise.all(requests))
        .rejects.toThrow('Rate limit exceeded');
    });
  });
});