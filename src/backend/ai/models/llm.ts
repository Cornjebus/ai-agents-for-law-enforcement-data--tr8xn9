import { injectable } from 'inversify';
import { Logger } from 'winston';
import { GenerationConfig } from '../../common/interfaces/content.interface';

/**
 * Enumeration of supported LLM providers
 * @version 1.0.0
 */
export enum LLMProvider {
    OPENAI = 'OPENAI',
    ANTHROPIC = 'ANTHROPIC'
}

/**
 * Enumeration of available model types
 * @version 1.0.0
 */
export enum ModelType {
    GPT4 = 'GPT4',
    CLAUDE = 'CLAUDE',
    GPT4_TURBO = 'GPT4_TURBO'
}

/**
 * Interface for retry configuration options
 */
interface RetryOptions {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    backoffFactor: number;
}

/**
 * Interface for rate limiting configuration
 */
interface RateLimitConfig {
    requestsPerMinute: number;
    tokensPerMinute: number;
    concurrentRequests: number;
}

/**
 * Configuration interface for LLM models
 */
export interface ModelConfig {
    provider: LLMProvider;
    model: ModelType;
    apiKey: string;
    temperature: number;
    maxTokens: number;
    contextWindow: number;
    retryConfig: RetryOptions;
    rateLimits: RateLimitConfig;
    telemetryEnabled: boolean;
}

/**
 * Interface for generation performance metrics
 */
interface PerformanceMetrics {
    latencyMs: number;
    processingTimeMs: number;
    queueTimeMs: number;
    tokenProcessingRate: number;
}

/**
 * Interface for generation metadata
 */
interface GenerationMetadata {
    modelVersion: string;
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    finishReason: string;
    validationPassed: boolean;
}

/**
 * Interface for token usage tracking
 */
export interface TokenUsage {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    costInCredits: number;
    remainingQuota: number;
}

/**
 * Enhanced interface for content generation results
 */
export interface GenerationResult {
    content: string;
    usage: TokenUsage;
    metadata: GenerationMetadata;
    performance: PerformanceMetrics;
    provider: LLMProvider;
    modelVersion: string;
    timestamp: Date;
}

/**
 * Interface for generation options
 */
interface GenerationOptions {
    stream?: boolean;
    timeout?: number;
    priority?: number;
    fallbackModel?: ModelType;
    validateOutput?: boolean;
}

/**
 * Interface for streaming options
 */
interface StreamOptions extends GenerationOptions {
    chunkSize?: number;
    flushInterval?: number;
    maxBufferSize?: number;
}

/**
 * Interface for streaming content chunk
 */
interface StreamChunk {
    content: string;
    done: boolean;
    metadata?: Partial<GenerationMetadata>;
}

/**
 * Enhanced abstract base class for LLM implementations
 * @version 1.0.0
 */
@injectable()
export abstract class LLMModel {
    protected config: ModelConfig;
    protected logger: Logger;
    protected retryManager: RetryManager;
    protected circuitBreaker: CircuitBreaker;
    protected tokenTracker: TokenUsageTracker;
    protected telemetry: TelemetryService;

    /**
     * Initializes the LLM model with enhanced configuration and services
     */
    constructor(
        config: ModelConfig,
        retryManager: RetryManager,
        telemetry: TelemetryService
    ) {
        this.validateConfig(config);
        this.config = this.initializeConfig(config);
        this.logger = this.initializeLogger();
        this.retryManager = retryManager;
        this.circuitBreaker = new CircuitBreaker(config.provider);
        this.tokenTracker = new TokenUsageTracker();
        this.telemetry = telemetry;
    }

    /**
     * Enhanced abstract method for content generation with retries and monitoring
     */
    public abstract generateContent(
        prompt: string,
        config: GenerationConfig,
        options?: GenerationOptions
    ): Promise<GenerationResult>;

    /**
     * Enhanced abstract method for streaming content with backpressure handling
     */
    public abstract streamContent(
        prompt: string,
        config: GenerationConfig,
        options?: StreamOptions
    ): AsyncGenerator<StreamChunk>;

    /**
     * Validates the model configuration
     */
    protected validateConfig(config: ModelConfig): void {
        if (!config.provider || !Object.values(LLMProvider).includes(config.provider)) {
            throw new Error('Invalid LLM provider specified');
        }
        if (!config.model || !Object.values(ModelType).includes(config.model)) {
            throw new Error('Invalid model type specified');
        }
        if (!config.apiKey || typeof config.apiKey !== 'string') {
            throw new Error('Invalid API key');
        }
        if (config.temperature < 0 || config.temperature > 1) {
            throw new Error('Temperature must be between 0 and 1');
        }
    }

    /**
     * Initializes model configuration with defaults
     */
    private initializeConfig(config: ModelConfig): ModelConfig {
        return {
            ...config,
            retryConfig: {
                maxAttempts: 3,
                initialDelay: 1000,
                maxDelay: 10000,
                backoffFactor: 2,
                ...config.retryConfig
            },
            rateLimits: {
                requestsPerMinute: 60,
                tokensPerMinute: 90000,
                concurrentRequests: 5,
                ...config.rateLimits
            }
        };
    }

    /**
     * Initializes structured logging
     */
    private initializeLogger(): Logger {
        return new Logger({
            level: 'info',
            format: 'json',
            defaultMeta: {
                service: 'llm-service',
                provider: this.config.provider,
                model: this.config.model
            }
        });
    }

    /**
     * Tracks token usage and updates quotas
     */
    protected async trackTokenUsage(usage: TokenUsage): Promise<void> {
        await this.tokenTracker.recordUsage(usage);
        if (this.config.telemetryEnabled) {
            await this.telemetry.recordMetric('token_usage', usage);
        }
    }

    /**
     * Handles provider-specific errors with retry logic
     */
    protected async handleProviderError(error: Error, context: any): Promise<void> {
        this.logger.error('Provider error occurred', {
            error: error.message,
            context
        });
        
        if (this.shouldRetry(error)) {
            await this.retryManager.executeWithRetry(
                () => this.generateContent(context.prompt, context.config),
                this.config.retryConfig
            );
        } else {
            throw error;
        }
    }

    /**
     * Determines if an error should trigger a retry
     */
    private shouldRetry(error: Error): boolean {
        const retryableErrors = [
            'rate_limit_exceeded',
            'timeout',
            'service_unavailable'
        ];
        return retryableErrors.some(e => error.message.includes(e));
    }
}