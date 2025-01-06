/**
 * @fileoverview Core authentication library providing secure authentication state management,
 * token handling, authorization utilities, and enhanced security monitoring
 * Version: 1.0.0
 */

import { decode } from 'jwt-decode'; // v3.1.2
import { AES, enc } from 'crypto-js'; // v4.1.1
import { User, AuthState, JWTPayload, UserRole } from '../types/auth';
import secureStorage from './storage';

// Authentication configuration constants
const AUTH_TOKEN_KEY = 'auth_token';
const AUTH_STATE_KEY = 'auth_state';
const TOKEN_EXPIRY_BUFFER = 300; // 5 minutes in seconds
const TOKEN_ROTATION_INTERVAL = 3600; // 1 hour in seconds
const PERMISSION_CACHE_DURATION = 60; // 1 minute in seconds

// Role hierarchy for permission checks
const ROLE_HIERARCHY: Record<UserRole, number> = {
    [UserRole.ADMIN]: 100,
    [UserRole.MANAGER]: 80,
    [UserRole.CONTENT_CREATOR]: 60,
    [UserRole.ANALYST]: 40,
    [UserRole.API_USER]: 20
};

// Permission cache storage
const permissionCache: Map<string, { result: boolean; timestamp: number }> = new Map();

/**
 * Default authentication state
 */
const DEFAULT_AUTH_STATE: AuthState = {
    isAuthenticated: false,
    user: null,
    loading: false,
    error: null,
    lastActivity: Date.now()
};

/**
 * Validates JWT token structure and expiration
 */
function validateToken(token: string): boolean {
    try {
        const decoded = decode<JWTPayload>(token);
        const currentTime = Math.floor(Date.now() / 1000);
        
        return decoded.exp > (currentTime + TOKEN_EXPIRY_BUFFER);
    } catch {
        return false;
    }
}

/**
 * Encrypts sensitive auth data before storage
 */
function encryptAuthData(data: any): string {
    const serialized = JSON.stringify(data);
    return AES.encrypt(serialized, process.env.NEXT_PUBLIC_AUTH_ENCRYPTION_KEY || '').toString();
}

/**
 * Decrypts auth data from storage
 */
function decryptAuthData(encrypted: string): any {
    try {
        const decrypted = AES.decrypt(encrypted, process.env.NEXT_PUBLIC_AUTH_ENCRYPTION_KEY || '');
        return JSON.parse(decrypted.toString(enc.Utf8));
    } catch {
        return null;
    }
}

/**
 * Logs security-relevant authentication events
 */
function logAuthEvent(event: string, details: Record<string, any>): void {
    const securityEvent = {
        timestamp: new Date().toISOString(),
        event,
        details,
        userAgent: navigator.userAgent,
        location: window.location.href
    };
    
    // Emit security event for monitoring
    window.dispatchEvent(new CustomEvent('auth-security-event', {
        detail: securityEvent
    }));
}

/**
 * Retrieves and validates current authentication state with activity tracking
 */
export function getAuthState(): AuthState {
    try {
        const encryptedState = secureStorage.getItem(AUTH_STATE_KEY, 'localStorage');
        if (!encryptedState) {
            return { ...DEFAULT_AUTH_STATE };
        }

        const state = decryptAuthData(encryptedState);
        if (!state || !state.isAuthenticated) {
            return { ...DEFAULT_AUTH_STATE };
        }

        // Validate token if present
        const token = secureStorage.getItem(AUTH_TOKEN_KEY, 'localStorage');
        if (!token || !validateToken(token)) {
            logAuthEvent('invalid_token', { reason: 'expired_or_invalid' });
            return { ...DEFAULT_AUTH_STATE };
        }

        // Update last activity
        const updatedState = {
            ...state,
            lastActivity: Date.now()
        };

        setAuthState(updatedState);
        return updatedState;
    } catch (error) {
        logAuthEvent('auth_state_error', { error: error.message });
        return { ...DEFAULT_AUTH_STATE };
    }
}

/**
 * Securely updates authentication state with encryption
 */
export function setAuthState(state: AuthState): void {
    try {
        // Validate state structure
        if (!state || typeof state.isAuthenticated !== 'boolean') {
            throw new Error('Invalid auth state structure');
        }

        // Add current timestamp
        const stateWithTimestamp = {
            ...state,
            lastActivity: Date.now()
        };

        // Encrypt and store state
        const encryptedState = encryptAuthData(stateWithTimestamp);
        secureStorage.setItem(AUTH_STATE_KEY, encryptedState, 'localStorage', true);

        // Emit state change event
        window.dispatchEvent(new CustomEvent('auth-state-change', {
            detail: { isAuthenticated: state.isAuthenticated }
        }));

        logAuthEvent('auth_state_update', {
            isAuthenticated: state.isAuthenticated,
            userId: state.user?.id
        });
    } catch (error) {
        logAuthEvent('auth_state_update_error', { error: error.message });
        throw error;
    }
}

/**
 * Implements secure token rotation mechanism
 */
export async function rotateToken(currentToken: string): Promise<string> {
    try {
        // Validate current token
        if (!validateToken(currentToken)) {
            throw new Error('Invalid token for rotation');
        }

        // Request new token from auth server
        const response = await fetch('/api/auth/rotate', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentToken}`,
                'Content-Type': 'application/json'
            }
        });

        if (!response.ok) {
            throw new Error('Token rotation failed');
        }

        const { token: newToken } = await response.json();

        // Validate new token
        if (!validateToken(newToken)) {
            throw new Error('Invalid new token received');
        }

        // Store new token
        await secureStorage.setItem(AUTH_TOKEN_KEY, newToken, 'localStorage', true);

        logAuthEvent('token_rotation', {
            success: true,
            tokenId: decode<JWTPayload>(newToken).jti
        });

        return newToken;
    } catch (error) {
        logAuthEvent('token_rotation_error', { error: error.message });
        throw error;
    }
}

/**
 * Checks user permissions with role hierarchy and caching
 */
export function hasPermission(requiredRole: UserRole): boolean {
    try {
        const cacheKey = `permission_${requiredRole}`;
        const cached = permissionCache.get(cacheKey);

        // Return cached result if valid
        if (cached && (Date.now() - cached.timestamp) < (PERMISSION_CACHE_DURATION * 1000)) {
            return cached.result;
        }

        // Get current auth state
        const state = getAuthState();
        if (!state.isAuthenticated || !state.user) {
            return false;
        }

        // Check role hierarchy
        const hasPermission = ROLE_HIERARCHY[state.user.role] >= ROLE_HIERARCHY[requiredRole];

        // Cache result
        permissionCache.set(cacheKey, {
            result: hasPermission,
            timestamp: Date.now()
        });

        logAuthEvent('permission_check', {
            userId: state.user.id,
            requiredRole,
            userRole: state.user.role,
            granted: hasPermission
        });

        return hasPermission;
    } catch (error) {
        logAuthEvent('permission_check_error', { error: error.message });
        return false;
    }
}