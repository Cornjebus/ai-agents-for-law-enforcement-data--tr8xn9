/**
 * @fileoverview Type definitions for authentication, authorization, and user management
 * Implements OAuth 2.0 + OIDC with JWT session management and role-based access control
 */

/**
 * Available user roles for role-based access control
 * Aligned with security requirements from technical specification
 */
export enum UserRole {
    ADMIN = 'ADMIN',
    MANAGER = 'MANAGER',
    CONTENT_CREATOR = 'CONTENT_CREATOR',
    ANALYST = 'ANALYST',
    API_USER = 'API_USER'
}

/**
 * User data structure with comprehensive user information
 * Includes role-based access control and organization membership
 */
export interface User {
    /** Unique identifier for the user */
    id: string;
    
    /** User's email address used for authentication */
    email: string;
    
    /** User's assigned role for access control */
    role: UserRole;
    
    /** User's first name */
    firstName: string;
    
    /** User's last name */
    lastName: string;
    
    /** Organization the user belongs to */
    organizationId: string;
    
    /** Timestamp of user account creation */
    createdAt: Date;
    
    /** Timestamp of user's last successful login */
    lastLoginAt: Date;
}

/**
 * Authentication state management interface
 * Tracks user session, loading states, and potential errors
 */
export interface AuthState {
    /** Indicates if user is currently authenticated */
    isAuthenticated: boolean;
    
    /** Currently authenticated user or null if not authenticated */
    user: User | null;
    
    /** Indicates if authentication operation is in progress */
    loading: boolean;
    
    /** Contains error message if authentication failed */
    error: string | null;
}

/**
 * Login credentials structure
 * Supports OAuth 2.0 password grant type
 */
export interface LoginCredentials {
    /** User's email address */
    email: string;
    
    /** User's password */
    password: string;
    
    /** Flag to enable extended session duration */
    rememberMe: boolean;
}

/**
 * Authentication response structure
 * Contains JWT tokens and user information
 */
export interface AuthResponse {
    /** Authenticated user information */
    user: User;
    
    /** JWT access token for API authorization */
    accessToken: string;
    
    /** JWT refresh token for obtaining new access tokens */
    refreshToken: string;
    
    /** Access token expiration time in seconds */
    expiresIn: number;
}

/**
 * JWT token payload structure
 * Contains essential claims for secure session management
 */
export interface JWTPayload {
    /** Subject identifier (user ID) */
    sub: string;
    
    /** User's role for authorization */
    role: UserRole;
    
    /** Organization context for multi-tenant security */
    organizationId: string;
    
    /** Token expiration timestamp */
    exp: number;
    
    /** Token issued at timestamp */
    iat: number;
}