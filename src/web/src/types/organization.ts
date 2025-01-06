/**
 * Organization-related type definitions for the Autonomous Revenue Generation Platform
 * @version 1.0.0
 */

/**
 * Main organization interface representing an organization entity with comprehensive settings
 */
export interface Organization {
  /** Unique identifier for the organization (UUID v4) */
  id: string;
  /** Organization display name */
  name: string;
  /** Industry sector classification */
  industry: string;
  /** Number of employees in the organization */
  size: number;
  /** Organization location details */
  location: {
    /** Physical address */
    address: string;
    /** City name */
    city: string;
    /** State or province */
    state: string;
    /** Country code (ISO 3166-1) */
    country: string;
    /** Timezone (IANA format) */
    timezone: string;
  };
  /** Organization configuration settings */
  settings: OrganizationSettings;
  /** AI-related configuration settings */
  aiConfig: OrganizationAIConfig;
  /** Current organization status */
  status: OrganizationStatus;
  /** Organization creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
}

/**
 * Comprehensive organization configuration settings interface
 */
export interface OrganizationSettings {
  /** Organization timezone (IANA format) */
  timezone: string;
  /** Business hours configuration */
  businessHours: {
    /** Daily schedule configuration */
    schedule: Record<string, {
      start: string;
      end: string;
      active: boolean;
    }>;
    /** Holiday dates */
    holidays: Date[];
    /** Special schedule overrides */
    overrides: Record<string, {
      start: string;
      end: string;
    }>;
  };
  /** Notification settings */
  notifications: {
    /** Email notification settings */
    email: {
      /** Email notifications status */
      enabled: boolean;
      /** Default email recipients */
      recipients: string[];
      /** Notification type preferences */
      preferences: Record<string, boolean>;
    };
    /** Slack integration settings */
    slack: {
      /** Slack integration status */
      enabled: boolean;
      /** Slack webhook URL */
      webhookUrl: string;
      /** Channel mapping for different notifications */
      channels: Record<string, string>;
    };
    /** In-app notification settings */
    inApp: {
      /** In-app notifications status */
      enabled: boolean;
      /** Notification type preferences */
      preferences: Record<string, boolean>;
    };
  };
  /** Organization branding settings */
  branding: {
    /** Organization logo URL */
    logo: string;
    /** Brand color scheme */
    colors: Record<string, string>;
    /** Brand typography */
    fonts: Record<string, string>;
  };
}

/**
 * Enhanced AI-specific configuration settings interface
 */
export interface OrganizationAIConfig {
  /** AI model settings */
  models: {
    /** Default LLM model selection */
    defaultModel: string;
    /** AI model temperature (0-1) */
    temperature: number;
    /** Maximum tokens per response */
    maxTokens: number;
    /** Top P sampling parameter */
    topP: number;
  };
  /** Voice synthesis settings */
  voice: {
    /** Default voice synthesis selection */
    defaultVoice: string;
    /** Speech rate (0.5-2.0) */
    speed: number;
    /** Voice pitch adjustment */
    pitch: number;
  };
  /** AI prompt configuration */
  prompts: {
    /** Custom prompt templates */
    templates: Record<string, string>;
    /** Global prompt variables */
    variables: Record<string, string>;
  };
  /** AI safety settings */
  safety: {
    /** Content filtering enabled */
    contentFilter: boolean;
    /** Maximum concurrent AI operations */
    maxConcurrentCalls: number;
  };
}

/**
 * Possible organization status values
 */
export enum OrganizationStatus {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  SUSPENDED = 'SUSPENDED',
  PENDING_VERIFICATION = 'PENDING_VERIFICATION'
}

/**
 * Available roles within an organization
 */
export enum OrganizationRole {
  OWNER = 'OWNER',
  ADMIN = 'ADMIN',
  MANAGER = 'MANAGER',
  MEMBER = 'MEMBER',
  VIEWER = 'VIEWER'
}