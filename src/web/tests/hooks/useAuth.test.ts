/**
 * @fileoverview Comprehensive test suite for useAuth hook verifying authentication,
 * authorization, and security features
 * Version: 1.0.0
 */

import { describe, test, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { renderHook, act } from '@testing-library/react-hooks';
import { useAuth } from '../../src/hooks/useAuth';
import { AuthService } from '../../src/services/auth.service';
import { User, UserRole } from '../../src/types/auth';

// Mock AuthService
jest.mock('../../src/services/auth.service');

// Test data
const mockUser: User = {
  id: 'test-user-id',
  email: 'test@example.com',
  role: UserRole.MANAGER,
  firstName: 'Test',
  lastName: 'User',
  organizationId: 'test-org-id',
  createdAt: new Date(),
  lastLoginAt: new Date()
};

const mockTokens = {
  accessToken: 'mock-access-token',
  refreshToken: 'mock-refresh-token',
  expiresIn: 3600
};

describe('useAuth Hook', () => {
  let mockAuthService: jest.Mocked<AuthService>;

  beforeEach(() => {
    // Reset all mocks before each test
    jest.clearAllMocks();
    localStorage.clear();
    sessionStorage.clear();

    // Setup AuthService mocks
    mockAuthService = {
      login: jest.fn(),
      logout: jest.fn(),
      refreshToken: jest.fn(),
      getCurrentUser: jest.fn(),
      validateToken: jest.fn(),
      checkPermission: jest.fn()
    } as unknown as jest.Mocked<AuthService>;

    // Mock successful token validation by default
    mockAuthService.validateToken.mockResolvedValue(true);

    // Mock window event listeners
    window.addEventListener = jest.fn();
    window.removeEventListener = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('initial state should be unauthenticated', () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(true);
    expect(result.current.error).toBeNull();
  });

  test('should handle successful login', async () => {
    // Setup mocks for successful login
    mockAuthService.login.mockResolvedValue({
      user: mockUser,
      ...mockTokens
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login({
        email: 'test@example.com',
        password: 'password123',
        rememberMe: false
      });
    });

    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.user).toEqual(mockUser);
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockAuthService.login).toHaveBeenCalledTimes(1);
  });

  test('should handle login failure', async () => {
    // Setup mocks for failed login
    const errorMessage = 'Invalid credentials';
    mockAuthService.login.mockRejectedValue(new Error(errorMessage));

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.login({
        email: 'test@example.com',
        password: 'wrongpassword',
        rememberMe: false
      });
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBe(errorMessage);
  });

  test('should handle logout', async () => {
    // Setup initial authenticated state
    mockAuthService.login.mockResolvedValue({
      user: mockUser,
      ...mockTokens
    });

    const { result } = renderHook(() => useAuth());

    // Login first
    await act(async () => {
      await result.current.login({
        email: 'test@example.com',
        password: 'password123',
        rememberMe: false
      });
    });

    // Then logout
    await act(async () => {
      await result.current.logout();
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
    expect(mockAuthService.logout).toHaveBeenCalledTimes(1);
  });

  test('should handle token refresh', async () => {
    // Setup mocks for token refresh
    mockAuthService.refreshToken.mockResolvedValue({
      user: mockUser,
      ...mockTokens,
      accessToken: 'new-access-token'
    });

    const { result } = renderHook(() => useAuth());

    await act(async () => {
      await result.current.refreshToken(mockTokens.refreshToken);
    });

    expect(mockAuthService.refreshToken).toHaveBeenCalledWith(mockTokens.refreshToken);
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.error).toBeNull();
  });

  test('should validate permissions correctly', async () => {
    // Setup mocks for permission checks
    mockAuthService.checkPermission.mockImplementation((role) => {
      return Promise.resolve(role === UserRole.MANAGER || role === UserRole.CONTENT_CREATOR);
    });

    const { result } = renderHook(() => useAuth());

    // Login with manager role
    await act(async () => {
      await result.current.login({
        email: 'test@example.com',
        password: 'password123',
        rememberMe: false
      });
    });

    // Check permissions
    await act(async () => {
      const hasManagerPermission = await result.current.checkPermission(UserRole.MANAGER);
      const hasAdminPermission = await result.current.checkPermission(UserRole.ADMIN);

      expect(hasManagerPermission).toBe(true);
      expect(hasAdminPermission).toBe(false);
    });
  });

  test('should handle security events', async () => {
    const { result } = renderHook(() => useAuth());

    // Mock security event dispatch
    const dispatchEventSpy = jest.spyOn(window, 'dispatchEvent');

    await act(async () => {
      await result.current.login({
        email: 'test@example.com',
        password: 'password123',
        rememberMe: false
      });
    });

    expect(dispatchEventSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'auth-security-event'
      })
    );
  });

  test('should handle session timeout', async () => {
    jest.useFakeTimers();

    const { result } = renderHook(() => useAuth());

    // Login
    await act(async () => {
      await result.current.login({
        email: 'test@example.com',
        password: 'password123',
        rememberMe: false
      });
    });

    // Simulate session timeout
    await act(async () => {
      jest.advanceTimersByTime(1800000); // 30 minutes
    });

    expect(result.current.isAuthenticated).toBe(false);
    expect(result.current.user).toBeNull();

    jest.useRealTimers();
  });

  test('should handle token rotation', async () => {
    // Setup mocks for token rotation
    mockAuthService.refreshToken.mockResolvedValue({
      user: mockUser,
      accessToken: 'rotated-access-token',
      refreshToken: 'rotated-refresh-token',
      expiresIn: 3600
    });

    const { result } = renderHook(() => useAuth());

    // Login and trigger token rotation
    await act(async () => {
      await result.current.login({
        email: 'test@example.com',
        password: 'password123',
        rememberMe: false
      });
    });

    // Simulate token rotation interval
    jest.advanceTimersByTime(3300000); // 55 minutes

    expect(mockAuthService.refreshToken).toHaveBeenCalled();
    expect(result.current.isAuthenticated).toBe(true);
    expect(result.current.error).toBeNull();
  });
});