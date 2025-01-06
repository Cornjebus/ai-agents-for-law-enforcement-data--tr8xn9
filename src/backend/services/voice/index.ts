import { Module } from '@nestjs/common'; // v10.0.0
import { ConfigModule } from '@nestjs/config'; // v3.0.0

import { CallController } from './controllers/call.controller';
import { SynthesisService } from './services/synthesis.service';
import { RecognitionService } from './services/recognition.service';

/**
 * Voice service configuration interface with geographic routing settings
 */
interface VoiceServiceConfig {
  defaultRegion: string;
  latencyThreshold: number;
  geographicRouting: {
    enabled: boolean;
    regions: string[];
    failoverStrategy: 'nearest' | 'performance' | 'round-robin';
  };
  performance: {
    maxLatency: number;
    targetQuality: number;
    errorThreshold: number;
  };
}

/**
 * Voice service configuration factory with performance optimization
 */
const voiceConfig = (): VoiceServiceConfig => ({
  defaultRegion: process.env.VOICE_DEFAULT_REGION || 'us-west-2',
  latencyThreshold: parseInt(process.env.VOICE_LATENCY_THRESHOLD || '200', 10),
  geographicRouting: {
    enabled: process.env.VOICE_GEO_ROUTING_ENABLED === 'true',
    regions: (process.env.VOICE_AVAILABLE_REGIONS || 'us-west-2,us-east-1').split(','),
    failoverStrategy: (process.env.VOICE_FAILOVER_STRATEGY || 'performance') as 'nearest' | 'performance' | 'round-robin'
  },
  performance: {
    maxLatency: parseInt(process.env.VOICE_MAX_LATENCY || '200', 10), // 200ms RTT target
    targetQuality: parseFloat(process.env.VOICE_TARGET_QUALITY || '0.85'),
    errorThreshold: parseInt(process.env.VOICE_ERROR_THRESHOLD || '5', 10)
  }
});

/**
 * Enhanced voice service module with geographic routing and performance optimization
 * Implements high-performance voice processing with <200ms RTT using geographic routing
 * and provides autonomous outbound calling capabilities through integrated services
 */
@Module({
  imports: [
    ConfigModule.forFeature(voiceConfig)
  ],
  providers: [
    SynthesisService,
    RecognitionService,
    {
      provide: 'VOICE_CONFIG',
      useFactory: voiceConfig
    }
  ],
  controllers: [CallController],
  exports: [
    SynthesisService,
    RecognitionService,
    CallController
  ]
})
export class VoiceModule {
  /**
   * Geographic region for voice processing
   */
  private readonly region: string;

  /**
   * Maximum acceptable latency for voice operations
   */
  private readonly latencyThreshold: number;

  constructor() {
    const config = voiceConfig();
    this.region = config.defaultRegion;
    this.latencyThreshold = config.latencyThreshold;

    // Initialize voice services with geographic routing
    this.initializeVoiceServices(config);
  }

  /**
   * Initialize voice services with geographic routing configuration
   */
  private initializeVoiceServices(config: VoiceServiceConfig): void {
    if (config.geographicRouting.enabled) {
      // Configure geographic routing for optimal performance
      this.configureGeographicRouting(config.geographicRouting);
    }

    // Set up performance monitoring
    this.configurePerformanceMonitoring(config.performance);
  }

  /**
   * Configure geographic routing for voice services
   */
  private configureGeographicRouting(config: VoiceServiceConfig['geographicRouting']): void {
    // Implementation handled by individual services through dependency injection
  }

  /**
   * Configure performance monitoring for voice services
   */
  private configurePerformanceMonitoring(config: VoiceServiceConfig['performance']): void {
    // Implementation handled by individual services through dependency injection
  }
}

// Export module components for external use
export { CallController, SynthesisService, RecognitionService };