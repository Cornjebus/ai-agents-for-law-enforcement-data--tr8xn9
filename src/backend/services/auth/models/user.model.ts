import { z } from 'zod'; // v3.22.0
import bcrypt from 'bcrypt'; // v5.1.1
import { Pool } from 'pg'; // v8.11.0
import { createDatabasePool } from '../../../common/config/database';
import { encryptData, decryptData, maskSensitiveData } from '../../../common/utils/encryption';
import { ValidationError } from '../../../common/utils/validation';

/**
 * Enhanced user role enumeration with granular access levels
 */
export enum UserRole {
    ADMIN = 'ADMIN',
    MANAGER = 'MANAGER',
    CONTENT_CREATOR = 'CONTENT_CREATOR',
    ANALYST = 'ANALYST',
    API_USER = 'API_USER',
    SECURITY_ADMIN = 'SECURITY_ADMIN',
    COMPLIANCE_OFFICER = 'COMPLIANCE_OFFICER'
}

/**
 * Comprehensive interface defining user data structure with security considerations
 */
export interface IUser {
    id: string;
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    role: UserRole;
    permissions: string[];
    isActive: boolean;
    lastLogin: Date;
    createdAt: Date;
    updatedAt: Date;
    lastLoginIp: string;
    securityStamp: string;
    requiresMfa: boolean;
    allowedIpRanges: string[];
}

/**
 * Security configuration interface for user model
 */
interface SecurityConfig {
    maxLoginAttempts: number;
    lockoutDuration: number;
    passwordMinLength: number;
    passwordMaxAge: number;
    mfaRequired: boolean;
    ipWhitelist: string[];
}

/**
 * Enhanced user model class with comprehensive security and validation
 */
export class UserModel {
    private readonly dbPool: Pool;
    private readonly schema: z.ZodSchema;
    private readonly maxLoginAttempts: number;
    private readonly lockoutDuration: number;
    private readonly loginAttempts: Map<string, number>;
    private readonly securityConfig: SecurityConfig;

    constructor(dbPool?: Pool, securityConfig?: Partial<SecurityConfig>) {
        // Initialize database pool
        this.dbPool = dbPool || createDatabasePool();

        // Initialize security configuration
        this.securityConfig = {
            maxLoginAttempts: securityConfig?.maxLoginAttempts || 5,
            lockoutDuration: securityConfig?.lockoutDuration || 900000, // 15 minutes
            passwordMinLength: securityConfig?.passwordMinLength || 12,
            passwordMaxAge: securityConfig?.passwordMaxAge || 90, // days
            mfaRequired: securityConfig?.mfaRequired || false,
            ipWhitelist: securityConfig?.ipWhitelist || []
        };

        // Initialize login attempts tracking
        this.loginAttempts = new Map();
        this.maxLoginAttempts = this.securityConfig.maxLoginAttempts;
        this.lockoutDuration = this.securityConfig.lockoutDuration;

        // Initialize validation schema
        this.schema = z.object({
            email: z.string().email(),
            password: z.string().min(this.securityConfig.passwordMinLength)
                .regex(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]{12,}$/),
            firstName: z.string().min(1).max(50),
            lastName: z.string().min(1).max(50),
            role: z.nativeEnum(UserRole),
            permissions: z.array(z.string()),
            isActive: z.boolean(),
            requiresMfa: z.boolean(),
            allowedIpRanges: z.array(z.string())
        });
    }

    /**
     * Creates a new user with enhanced security measures
     */
    public async create(userData: Partial<IUser>): Promise<IUser> {
        try {
            // Validate user data
            this.schema.parse(userData);

            // Check for existing email
            const existingUser = await this.findByEmail(userData.email!);
            if (existingUser) {
                throw new ValidationError('Email already exists', {
                    email: ['Email address is already registered']
                }, 'USER_001');
            }

            // Generate security stamp
            const securityStamp = await this.generateSecurityStamp();

            // Hash password with bcrypt
            const hashedPassword = await bcrypt.hash(userData.password!, 12);

            // Encrypt sensitive data
            const encryptedFirstName = await encryptData(userData.firstName!, Buffer.from(process.env.ENCRYPTION_KEY!));
            const encryptedLastName = await encryptData(userData.lastName!, Buffer.from(process.env.ENCRYPTION_KEY!));

            // Prepare user object
            const user: IUser = {
                id: crypto.randomUUID(),
                email: userData.email!,
                password: hashedPassword,
                firstName: encryptedFirstName.toString(),
                lastName: encryptedLastName.toString(),
                role: userData.role || UserRole.ANALYST,
                permissions: userData.permissions || [],
                isActive: true,
                lastLogin: new Date(),
                createdAt: new Date(),
                updatedAt: new Date(),
                lastLoginIp: '',
                securityStamp,
                requiresMfa: this.securityConfig.mfaRequired,
                allowedIpRanges: userData.allowedIpRanges || []
            };

            // Insert user with audit trail
            const query = `
                INSERT INTO users 
                (id, email, password, first_name, last_name, role, permissions, 
                is_active, last_login, created_at, updated_at, last_login_ip, 
                security_stamp, requires_mfa, allowed_ip_ranges)
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
                RETURNING *
            `;

            const result = await this.dbPool.query(query, [
                user.id, user.email, user.password, user.firstName, user.lastName,
                user.role, user.permissions, user.isActive, user.lastLogin,
                user.createdAt, user.updatedAt, user.lastLoginIp,
                user.securityStamp, user.requiresMfa, user.allowedIpRanges
            ]);

            // Mask sensitive data before returning
            const maskedUser = this.maskSensitiveUserData(result.rows[0]);
            return maskedUser;

        } catch (error) {
            if (error instanceof ValidationError) {
                throw error;
            }
            throw new ValidationError(
                'User creation failed',
                { general: [error.message] },
                'USER_002'
            );
        }
    }

    /**
     * Generates a unique security stamp for user sessions
     */
    private async generateSecurityStamp(): Promise<string> {
        return crypto.randomBytes(32).toString('hex');
    }

    /**
     * Finds a user by email with security checks
     */
    private async findByEmail(email: string): Promise<IUser | null> {
        const query = 'SELECT * FROM users WHERE email = $1';
        const result = await this.dbPool.query(query, [email]);
        return result.rows[0] || null;
    }

    /**
     * Masks sensitive user data for safe transmission
     */
    private maskSensitiveUserData(user: IUser): IUser {
        const maskedUser = { ...user };
        delete maskedUser.password;
        maskedUser.email = maskSensitiveData(user.email);
        return maskedUser;
    }
}

export default UserModel;