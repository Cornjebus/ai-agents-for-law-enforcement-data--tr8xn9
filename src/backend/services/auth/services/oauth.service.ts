import { Client, Issuer, TokenSet, generators } from 'openid-client'; // v4.9.1
import axios from 'axios'; // v1.4.0
import * as jose from 'jose'; // v4.14.4
import { ServiceProvider, IdentityProvider } from 'samlify'; // v2.8.0
import NodeCache from 'node-cache'; // v5.1.2
import { UserModel, IUser, UserRole } from '../models/user.model';
import { JWTService } from './jwt.service';
import { ValidationError } from '../../../common/utils/validation';

/**
 * Enhanced configuration interface for OAuth/SAML providers
 */
interface OAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri: string;
    discoveryUrl: string;
    scope: string[];
    provider: string;
    isSaml: boolean;
    samlCertificate?: string;
    samlPrivateKey?: string;
    tokenExpirySeconds: number;
    maxRetries: number;
}

/**
 * Enhanced interface for normalized OAuth/SAML user profile data
 */
interface OAuthUserProfile {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
    picture: string;
    roles: string[];
    organization: string;
    rawProfile: Record<string, any>;
    metadata: Record<string, any>;
}

/**
 * Constants for OAuth configuration and error handling
 */
const DEFAULT_SCOPE = ['openid', 'profile', 'email'];

const OAUTH_ERRORS = {
    INVALID_STATE: 'Invalid or expired state parameter',
    INVALID_TOKEN: 'Invalid or expired OAuth token',
    INVALID_SIGNATURE: 'Invalid token signature',
    INVALID_CLAIMS: 'Invalid token claims',
    PROFILE_FETCH_ERROR: 'Error fetching user profile',
    PROVIDER_ERROR: 'OAuth provider error',
    RATE_LIMIT_EXCEEDED: 'Rate limit exceeded',
    SAML_ERROR: 'SAML authentication error'
};

const RATE_LIMIT_CONFIG = {
    MAX_ATTEMPTS: 5,
    WINDOW_MS: 300000, // 5 minutes
    BLOCK_DURATION_MS: 900000 // 15 minutes
};

/**
 * Enhanced OAuth service implementation with comprehensive security features
 */
export class OAuthService {
    private oidcClient: Client;
    private samlProvider?: ServiceProvider;
    private cache: NodeCache;
    private readonly config: OAuthConfig;
    private readonly userModel: UserModel;
    private readonly jwtService: JWTService;

    constructor(
        config: OAuthConfig,
        userModel: UserModel,
        jwtService: JWTService
    ) {
        this.config = config;
        this.userModel = userModel;
        this.jwtService = jwtService;
        this.cache = new NodeCache({ stdTTL: 300, checkperiod: 60 });
        this.initialize();
    }

    /**
     * Initializes OAuth/SAML providers with enhanced security
     */
    private async initialize(): Promise<void> {
        try {
            if (this.config.isSaml) {
                this.initializeSamlProvider();
            } else {
                await this.initializeOidcClient();
            }
        } catch (error) {
            console.error('OAuth initialization failed:', error);
            throw new Error('Failed to initialize OAuth service');
        }
    }

    /**
     * Initializes OpenID Connect client with enhanced security
     */
    private async initializeOidcClient(): Promise<void> {
        const issuer = await Issuer.discover(this.config.discoveryUrl);
        this.oidcClient = new issuer.Client({
            client_id: this.config.clientId,
            client_secret: this.config.clientSecret,
            redirect_uris: [this.config.redirectUri],
            response_types: ['code'],
            token_endpoint_auth_method: 'client_secret_post'
        });
    }

    /**
     * Initializes SAML provider with enhanced security
     */
    private initializeSamlProvider(): void {
        if (!this.config.samlCertificate || !this.config.samlPrivateKey) {
            throw new Error('SAML certificate and private key are required');
        }

        this.samlProvider = ServiceProvider({
            entityID: this.config.clientId,
            assertionConsumerService: [{
                Binding: 'urn:oasis:names:tc:SAML:2.0:bindings:HTTP-POST',
                Location: this.config.redirectUri
            }],
            signingCert: this.config.samlCertificate,
            privateKey: this.config.samlPrivateKey,
            encryptCert: this.config.samlCertificate,
            isAssertionEncrypted: true,
            messageSigningOrder: 'sign-then-encrypt'
        });
    }

    /**
     * Initiates OAuth/SAML authentication flow with enhanced security
     */
    public async authenticate(options: { state?: string; nonce?: string } = {}): Promise<string> {
        try {
            if (this.config.isSaml) {
                return this.initiateSamlAuth();
            }

            const state = options.state || generators.state();
            const nonce = options.nonce || generators.nonce();
            const codeVerifier = generators.codeVerifier();
            const codeChallenge = generators.codeChallenge(codeVerifier);

            // Store PKCE and state parameters securely
            this.cache.set(`state:${state}`, {
                codeVerifier,
                nonce,
                timestamp: Date.now()
            }, 300); // 5 minute TTL

            const authUrl = this.oidcClient.authorizationUrl({
                scope: this.config.scope.join(' '),
                state,
                nonce,
                code_challenge: codeChallenge,
                code_challenge_method: 'S256'
            });

            return authUrl;
        } catch (error) {
            console.error('Authentication initiation failed:', error);
            throw new Error(OAUTH_ERRORS.PROVIDER_ERROR);
        }
    }

    /**
     * Initiates SAML authentication flow
     */
    private async initiateSamlAuth(): Promise<string> {
        try {
            const state = generators.state();
            this.cache.set(`saml:${state}`, { timestamp: Date.now() }, 300);

            const { context } = await this.samlProvider!.createLoginRequest(
                IdentityProvider({}),
                'redirect'
            );

            return context;
        } catch (error) {
            console.error('SAML authentication failed:', error);
            throw new Error(OAUTH_ERRORS.SAML_ERROR);
        }
    }

    /**
     * Processes OAuth/SAML callback with enhanced security validation
     */
    public async handleCallback(
        code: string,
        state: string,
        samlResponse?: string
    ): Promise<IUser> {
        try {
            if (this.config.isSaml && samlResponse) {
                return this.handleSamlCallback(samlResponse, state);
            }

            return this.handleOAuthCallback(code, state);
        } catch (error) {
            console.error('Callback handling failed:', error);
            throw new Error(OAUTH_ERRORS.PROVIDER_ERROR);
        }
    }

    /**
     * Processes OAuth callback with enhanced security validation
     */
    private async handleOAuthCallback(code: string, state: string): Promise<IUser> {
        const cached = this.cache.get(`state:${state}`);
        if (!cached) {
            throw new Error(OAUTH_ERRORS.INVALID_STATE);
        }

        const { codeVerifier, nonce } = cached as any;
        this.cache.del(`state:${state}`);

        const tokens = await this.oidcClient.callback(
            this.config.redirectUri,
            { code, state },
            { code_verifier: codeVerifier, nonce }
        );

        await this.validateTokens(tokens);
        const profile = await this.fetchUserProfile(tokens);
        return this.processUserProfile(profile);
    }

    /**
     * Processes SAML callback with enhanced security validation
     */
    private async handleSamlCallback(
        samlResponse: string,
        state: string
    ): Promise<IUser> {
        const cached = this.cache.get(`saml:${state}`);
        if (!cached) {
            throw new Error(OAUTH_ERRORS.INVALID_STATE);
        }

        this.cache.del(`saml:${state}`);

        const { extract } = await this.samlProvider!.parseLoginResponse(
            IdentityProvider({}),
            'post',
            { body: { SAMLResponse: samlResponse } }
        );

        const profile = this.parseSamlProfile(extract);
        return this.processUserProfile(profile);
    }

    /**
     * Validates OAuth tokens with enhanced security checks
     */
    private async validateTokens(tokens: TokenSet): Promise<void> {
        const { access_token, id_token } = tokens;

        if (!access_token || !id_token) {
            throw new Error(OAUTH_ERRORS.INVALID_TOKEN);
        }

        // Validate ID token signature and claims
        const jwks = await this.oidcClient.issuer.keystore();
        const verified = await jose.jwtVerify(id_token, jwks, {
            issuer: this.oidcClient.issuer.metadata.issuer,
            audience: this.config.clientId
        });

        if (!verified) {
            throw new Error(OAUTH_ERRORS.INVALID_SIGNATURE);
        }
    }

    /**
     * Fetches and normalizes user profile from OAuth provider
     */
    private async fetchUserProfile(tokens: TokenSet): Promise<OAuthUserProfile> {
        try {
            const userinfo = await this.oidcClient.userinfo(tokens);
            return this.normalizeProfile(userinfo);
        } catch (error) {
            console.error('Profile fetch failed:', error);
            throw new Error(OAUTH_ERRORS.PROFILE_FETCH_ERROR);
        }
    }

    /**
     * Normalizes OAuth/SAML profile data
     */
    private normalizeProfile(rawProfile: any): OAuthUserProfile {
        return {
            id: rawProfile.sub || rawProfile.id,
            email: rawProfile.email,
            firstName: rawProfile.given_name || rawProfile.firstName,
            lastName: rawProfile.family_name || rawProfile.lastName,
            picture: rawProfile.picture,
            roles: rawProfile.roles || [UserRole.ANALYST],
            organization: rawProfile.organization,
            rawProfile,
            metadata: {
                provider: this.config.provider,
                authenticatedAt: new Date().toISOString()
            }
        };
    }

    /**
     * Processes user profile and creates/updates user record
     */
    private async processUserProfile(profile: OAuthUserProfile): Promise<IUser> {
        try {
            const existingUser = await this.userModel.findByEmail(profile.email);

            if (existingUser) {
                // Update existing user
                return existingUser;
            }

            // Create new user
            const newUser = await this.userModel.create({
                email: profile.email,
                firstName: profile.firstName,
                lastName: profile.lastName,
                role: profile.roles[0] as UserRole,
                permissions: [],
                isActive: true,
                requiresMfa: false,
                allowedIpRanges: []
            });

            return newUser;
        } catch (error) {
            console.error('User processing failed:', error);
            throw new ValidationError(
                'Failed to process user profile',
                { profile: [error.message] },
                'AUTH_001'
            );
        }
    }

    /**
     * Parses SAML profile data
     */
    private parseSamlProfile(extract: any): OAuthUserProfile {
        const attributes = extract.attributes;
        return this.normalizeProfile({
            id: extract.nameID,
            email: attributes.email,
            firstName: attributes.firstName,
            lastName: attributes.lastName,
            roles: attributes.roles?.split(',') || [UserRole.ANALYST],
            organization: attributes.organization
        });
    }
}

export { OAuthConfig, OAuthUserProfile, OAUTH_ERRORS };