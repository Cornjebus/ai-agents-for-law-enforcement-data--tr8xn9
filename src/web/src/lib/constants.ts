import { MetricType } from '../types/analytics';
import { UserRole } from '../types/auth';
import { CampaignType } from '../types/campaign';

// Environment & Version
export const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '1.0.0';
export const NODE_ENV = process.env.NODE_ENV || 'development';
export const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
export const AI_API_KEY = process.env.NEXT_PUBLIC_AI_API_KEY || '';

// API Configuration
export const API_CONFIG = {
  BASE_URL: API_BASE_URL,
  VERSION: 'v1',
  TIMEOUT: 30000,
  RETRY_CONFIG: {
    maxRetries: 3,
    backoffFactor: 2,
    initialDelay: 1000,
    maxDelay: 10000,
  },
  ENDPOINTS: {
    AUTH: '/auth',
    CAMPAIGNS: '/campaigns',
    ANALYTICS: '/analytics',
    CONTENT: '/content',
    VOICE: '/voice',
  }
} as const;

// Design System Constants
export const DESIGN_SYSTEM = {
  COLORS: {
    primary: '#2563EB',
    secondary: '#3B82F6',
    success: '#059669',
    error: '#DC2626',
    warning: '#F59E0B',
    gray: {
      50: '#F9FAFB',
      100: '#F3F4F6',
      200: '#E5E7EB',
      300: '#D1D5DB',
      400: '#9CA3AF',
      500: '#6B7280',
      600: '#4B5563',
      700: '#374151',
      800: '#1F2937',
      900: '#111827',
    }
  },
  TYPOGRAPHY: {
    fontFamily: {
      primary: 'Inter, sans-serif',
      secondary: 'Roboto, sans-serif',
    },
    fontSize: {
      xs: '12px',
      sm: '14px',
      base: '16px',
      lg: '20px',
      xl: '24px',
      '2xl': '32px',
    },
    fontWeight: {
      normal: '400',
      medium: '500',
      semibold: '600',
      bold: '700',
    },
    lineHeight: {
      tight: '1.25',
      normal: '1.5',
      relaxed: '1.75',
    }
  },
  SPACING: {
    base: 4,
    xs: 8,
    sm: 16,
    md: 24,
    lg: 32,
    xl: 48,
    '2xl': 64,
  },
  BREAKPOINTS: {
    mobile: 320,
    tablet: 768,
    desktop: 1024,
    wide: 1440,
  },
  SHADOWS: {
    sm: '0 2px 4px rgba(0,0,0,0.1)',
    md: '0 4px 6px rgba(0,0,0,0.1)',
    lg: '0 10px 15px rgba(0,0,0,0.1)',
  },
  ACCESSIBILITY: {
    focusRing: '0 0 0 2px rgba(37, 99, 235, 0.5)',
    minTapTarget: '44px',
    animationDuration: '200ms',
  }
} as const;

// Analytics Configuration
export const ANALYTICS_CONFIG = {
  DEFAULT_TIME_RANGE: 'LAST_30_DAYS',
  UPDATE_INTERVAL: 30000, // 30 seconds
  CHART_COLORS: {
    [MetricType.REVENUE]: '#059669',
    [MetricType.CONVERSION_RATE]: '#2563EB',
    [MetricType.CALL_VOLUME]: '#F59E0B',
    [MetricType.LEAD_QUALITY]: '#8B5CF6',
    [MetricType.CAMPAIGN_PERFORMANCE]: '#EC4899',
    [MetricType.AI_EFFICIENCY]: '#6366F1',
    [MetricType.API_LATENCY]: '#DC2626',
    [MetricType.VOICE_PROCESSING_TIME]: '#9333EA',
  },
  PERFORMANCE_THRESHOLDS: {
    [MetricType.API_LATENCY]: 200, // ms
    [MetricType.VOICE_PROCESSING_TIME]: 300, // ms
    [MetricType.CONVERSION_RATE]: 0.15, // 15%
    [MetricType.AI_EFFICIENCY]: 0.85, // 85%
  },
  CHART_DEFAULTS: {
    animation: {
      duration: 1000,
      easing: 'easeInOutQuart',
    },
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index',
    },
    plugins: {
      tooltip: {
        enabled: true,
        position: 'nearest',
      },
      legend: {
        position: 'bottom',
      }
    }
  }
} as const;

// AI Model Configuration
export const AI_CONFIG = {
  LLM_SETTINGS: {
    model: 'gpt-4',
    maxTokens: 8000,
    temperature: 0.7,
    topP: 0.9,
    frequencyPenalty: 0.5,
    presencePenalty: 0.5,
  },
  VOICE_SYNTHESIS: {
    provider: 'amazon-polly',
    defaultVoice: 'Matthew',
    sampleRate: 16000,
    audioFormat: 'mp3',
    languageCode: 'en-US',
  },
  MODEL_DEFAULTS: {
    [CampaignType.OUTBOUND_CALL]: {
      contextWindow: 100000,
      responseTimeout: 5000,
      confidenceThreshold: 0.85,
      fallbackBehavior: 'human-handoff',
    },
    [CampaignType.SOCIAL_MEDIA]: {
      maxContentLength: 280,
      hashtagLimit: 3,
      mediaTypes: ['image', 'video'],
      postFrequency: 4, // posts per day
    },
    [CampaignType.EMAIL_SEQUENCE]: {
      maxSubjectLength: 100,
      maxBodyLength: 2000,
      personalizationTokens: true,
      abTestingEnabled: true,
    }
  }
} as const;

// Role-based Access Configuration
export const RBAC_CONFIG = {
  [UserRole.ADMIN]: {
    allowedRoutes: ['*'],
    features: ['*'],
  },
  [UserRole.MANAGER]: {
    allowedRoutes: ['/dashboard', '/campaigns', '/analytics', '/team'],
    features: ['campaign.create', 'campaign.edit', 'analytics.view', 'team.manage'],
  },
  [UserRole.CONTENT_CREATOR]: {
    allowedRoutes: ['/dashboard', '/campaigns', '/content'],
    features: ['content.create', 'content.edit', 'campaign.view'],
  },
  [UserRole.ANALYST]: {
    allowedRoutes: ['/dashboard', '/analytics'],
    features: ['analytics.view', 'reports.export'],
  },
  [UserRole.API_USER]: {
    allowedRoutes: ['/api-docs'],
    features: ['api.access'],
  }
} as const;