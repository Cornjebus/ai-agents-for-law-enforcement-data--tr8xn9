import { injectable } from 'inversify';
import { OpenAIApi, Configuration } from 'openai'; // v4.0.0
import { Logger } from 'winston'; // v3.8.2
import { Redis } from 'ioredis'; // v5.0.0
import CircuitBreaker from 'opossum'; // v6.0.0
import { MetricsCollector } from '@opentelemetry/metrics'; // v1.0.0

import { LLMModel, ModelConfig, GenerationResult, TokenUsage } from '../models/llm';
import { GenerationConfig } from '../../common/interfaces/content.interface';
import { MetricType, MetricUnit } from '../../common/interfaces/metric.interface';

@injectable()
export class OpenAIService extends LLMModel {
    private readonly openai: OpenAIApi;
    private readonly cache: Redis;
    private readonly circuitBreaker: CircuitBreaker;
    private readonly metricsCollector: MetricsCollector;
    private readonly CACHE_TTL = 3600; // 1 hour cache TTL
    private readonly MAX_RETRIES = 3;

    constructor(
        config: ModelConfig,
        metricsCollector: MetricsCollector,
        cache: Redis
    ) {
        super(config, null, null);

        // Initialize OpenAI client with configuration
        const openAIConfig = new Configuration({
            apiKey: config.apiKey,
            maxRetries: this.MAX_RETRIES,
            timeout: 30000, // 30 second timeout
        });
        this.openai = new OpenAIApi(openAIConfig);
        this.cache = cache;
        this.metricsCollector = metricsCollector;

        // Configure circuit breaker
        this.circuitBreaker = new CircuitBreaker(this.makeOpenAIRequest.bind(this), {
            timeout: 30000,
            errorThresholdPercentage: 50,
            resetTimeout: 30000,
        });

        this.initializeMetrics();
    }

    private initializeMetrics(): void {
        this.metricsCollector.createCounter('openai.requests.total', {
            description: 'Total OpenAI API requests made'
        });
        this.metricsCollector.createHistogram('openai.latency', {
            description: 'OpenAI API request latency',
            unit: MetricUnit.MILLISECONDS
        });
        this.metricsCollector.createCounter('openai.tokens.total', {
            description: 'Total tokens consumed'
        });
    }

    public async generateContent(
        prompt: string,
        config: GenerationConfig
    ): Promise<GenerationResult> {
        const startTime = Date.now();
        const cacheKey = this.generateCacheKey(prompt, config);

        try {
            // Check cache first
            const cachedResult = await this.cache.get(cacheKey);
            if (cachedResult) {
                this.logger.debug('Cache hit for content generation', { prompt: prompt.substring(0, 100) });
                return JSON.parse(cachedResult);
            }

            // Make API request through circuit breaker
            const result = await this.circuitBreaker.fire(prompt, config);
            const latency = Date.now() - startTime;

            // Record metrics
            this.recordMetrics(latency, result.usage);

            // Cache successful response
            await this.cache.setex(cacheKey, this.CACHE_TTL, JSON.stringify(result));

            return result;
        } catch (error) {
            this.logger.error('Error generating content', {
                error: error.message,
                prompt: prompt.substring(0, 100)
            });
            throw this.handleOpenAIError(error);
        }
    }

    public async *streamContent(
        prompt: string,
        config: GenerationConfig
    ): AsyncGenerator<string, void, unknown> {
        const startTime = Date.now();

        try {
            const response = await this.openai.createChatCompletion({
                model: 'gpt-4',
                messages: [{ role: 'user', content: prompt }],
                stream: true,
                ...this.mapConfig(config)
            });

            let accumulatedTokens = 0;
            for await (const chunk of response.data) {
                const content = chunk.choices[0]?.delta?.content;
                if (content) {
                    accumulatedTokens += this.estimateTokenCount(content);
                    yield content;
                }
            }

            // Record streaming metrics
            this.recordStreamingMetrics(Date.now() - startTime, accumulatedTokens);
        } catch (error) {
            this.logger.error('Error streaming content', {
                error: error.message,
                prompt: prompt.substring(0, 100)
            });
            throw this.handleOpenAIError(error);
        }
    }

    private async makeOpenAIRequest(
        prompt: string,
        config: GenerationConfig
    ): Promise<GenerationResult> {
        const response = await this.openai.createChatCompletion({
            model: 'gpt-4',
            messages: [{ role: 'user', content: prompt }],
            ...this.mapConfig(config)
        });

        const completion = response.data.choices[0];
        const usage = response.data.usage;

        return {
            content: completion.message.content,
            usage: {
                promptTokens: usage.prompt_tokens,
                completionTokens: usage.completion_tokens,
                totalTokens: usage.total_tokens,
                costInCredits: this.calculateCost(usage.total_tokens),
                remainingQuota: await this.getRemainingQuota()
            },
            metadata: {
                modelVersion: response.data.model,
                promptTokens: usage.prompt_tokens,
                completionTokens: usage.completion_tokens,
                totalTokens: usage.total_tokens,
                finishReason: completion.finish_reason,
                validationPassed: true
            },
            performance: {
                latencyMs: response.data.created * 1000,
                processingTimeMs: Date.now() - (response.data.created * 1000),
                queueTimeMs: 0,
                tokenProcessingRate: this.calculateTokenRate(usage.total_tokens, response.data.created)
            },
            provider: this.config.provider,
            modelVersion: response.data.model,
            timestamp: new Date()
        };
    }

    private mapConfig(config: GenerationConfig): Record<string, any> {
        return {
            temperature: config.temperature || 0.7,
            max_tokens: config.maxTokens || 2000,
            top_p: 0.9,
            frequency_penalty: 0.5,
            presence_penalty: 0.5
        };
    }

    private generateCacheKey(prompt: string, config: GenerationConfig): string {
        return `openai:${this.config.model}:${Buffer.from(prompt).toString('base64')}:${JSON.stringify(config)}`;
    }

    private recordMetrics(latency: number, usage: TokenUsage): void {
        this.metricsCollector.recordMetric('openai.requests.total', 1);
        this.metricsCollector.recordMetric('openai.latency', latency);
        this.metricsCollector.recordMetric('openai.tokens.total', usage.totalTokens);
    }

    private recordStreamingMetrics(duration: number, tokens: number): void {
        this.metricsCollector.recordMetric('openai.streaming.duration', duration);
        this.metricsCollector.recordMetric('openai.streaming.tokens', tokens);
    }

    private handleOpenAIError(error: any): Error {
        if (error.response?.status === 429) {
            return new Error('Rate limit exceeded. Please try again later.');
        }
        if (error.response?.status === 401) {
            return new Error('Authentication error. Please check your API key.');
        }
        if (error.response?.status === 500) {
            return new Error('OpenAI service error. Please try again later.');
        }
        return error;
    }

    private calculateCost(tokens: number): number {
        // GPT-4 pricing: $0.03 per 1K tokens
        return (tokens / 1000) * 0.03;
    }

    private async getRemainingQuota(): Promise<number> {
        // Implement quota checking logic here
        return 1000000; // Placeholder
    }

    private calculateTokenRate(tokens: number, timestamp: number): number {
        const duration = Date.now() - (timestamp * 1000);
        return tokens / (duration / 1000); // tokens per second
    }

    private estimateTokenCount(text: string): number {
        // Rough estimation: ~4 characters per token
        return Math.ceil(text.length / 4);
    }
}