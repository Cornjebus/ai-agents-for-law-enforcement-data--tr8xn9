import { injectable } from 'inversify'; // v6.0.1
import { Logger } from 'winston'; // v3.8.2
import { CircuitBreaker } from 'opossum'; // v6.0.0
import { Telemetry } from '@opentelemetry/api'; // v1.0.0

import { IContent, ContentMetadata, ContentStatus } from '../../../common/interfaces/content.interface';
import { ContentModel } from '../models/content.model';
import { OpenAIService } from '../../../ai/services/openai.service';
import { MetricType } from '../../../common/interfaces/metric.interface';

interface RetryConfiguration {
    maxAttempts: number;
    initialDelay: number;
    maxDelay: number;
    backoffFactor: number;
}

@injectable()
export class ContentGenerationService {
    private readonly retryConfig: RetryConfiguration = {
        maxAttempts: 3,
        initialDelay: 1000,
        maxDelay: 10000,
        backoffFactor: 2
    };

    constructor(
        private readonly openaiService: OpenAIService,
        private readonly logger: Logger,
        private readonly circuitBreaker: CircuitBreaker,
        private readonly telemetry: Telemetry
    ) {
        this.initializeCircuitBreaker();
    }

    private initializeCircuitBreaker(): void {
        this.circuitBreaker.fallback(() => {
            this.logger.warn('Circuit breaker fallback triggered for content generation');
            throw new Error('Service temporarily unavailable');
        });

        this.circuitBreaker.on('success', () => {
            this.logger.info('Content generation successful');
        });

        this.circuitBreaker.on('failure', (error) => {
            this.logger.error('Content generation failed', { error });
        });
    }

    public async generateContent(metadata: ContentMetadata): Promise<ContentModel> {
        const span = this.telemetry.startSpan('generateContent');
        
        try {
            await this.validateMetadata(metadata);
            
            const prompt = this.buildGenerationPrompt(metadata);
            
            const generationResult = await this.circuitBreaker.fire(async () => {
                return this.openaiService.generateContent(prompt, {
                    temperature: metadata.generationParameters.temperature || 0.7,
                    maxTokens: metadata.generationParameters.maxTokens || 2000,
                    model: metadata.aiModel,
                    modelVersion: metadata.modelVersion
                });
            });

            const content = new ContentModel({
                content: generationResult.content,
                metadata: {
                    ...metadata,
                    aiModel: generationResult.modelVersion,
                    generationParameters: {
                        ...metadata.generationParameters,
                        tokenUsage: generationResult.usage
                    }
                },
                status: ContentStatus.DRAFT,
                metrics: {
                    impressions: 0,
                    engagements: 0,
                    clicks: 0,
                    conversions: 0,
                    performance: [{
                        type: MetricType.CONTENT_GENERATION_TIME,
                        value: generationResult.performance.latencyMs,
                        timestamp: new Date()
                    }],
                    platformSpecificMetrics: {},
                    aiPerformanceMetrics: {
                        confidenceScore: generationResult.metadata.validationPassed ? 1 : 0,
                        tokenProcessingRate: generationResult.performance.tokenProcessingRate
                    }
                }
            });

            await this.validateGeneratedContent(content);
            
            this.logger.info('Content generated successfully', {
                contentId: content.id,
                metadata: metadata.title,
                performance: generationResult.performance
            });

            return content;
        } catch (error) {
            this.logger.error('Content generation failed', {
                error: error.message,
                metadata
            });
            throw error;
        } finally {
            span.end();
        }
    }

    public async *streamGenerateContent(metadata: ContentMetadata): AsyncGenerator<string> {
        const span = this.telemetry.startSpan('streamGenerateContent');
        
        try {
            await this.validateMetadata(metadata);
            const prompt = this.buildGenerationPrompt(metadata);
            
            const stream = await this.openaiService.streamContent(prompt, {
                temperature: metadata.generationParameters.temperature || 0.7,
                maxTokens: metadata.generationParameters.maxTokens || 2000,
                model: metadata.aiModel,
                modelVersion: metadata.modelVersion
            });

            for await (const chunk of stream) {
                yield chunk;
            }
        } catch (error) {
            this.logger.error('Content streaming failed', {
                error: error.message,
                metadata
            });
            throw error;
        } finally {
            span.end();
        }
    }

    public async optimizeContent(content: ContentModel): Promise<ContentModel> {
        const span = this.telemetry.startSpan('optimizeContent');
        
        try {
            const optimizationPrompt = this.buildOptimizationPrompt(content);
            
            const optimizationResult = await this.circuitBreaker.fire(async () => {
                return this.openaiService.generateContent(optimizationPrompt, {
                    temperature: 0.5,
                    maxTokens: 1000,
                    model: content.metadata.aiModel,
                    modelVersion: content.metadata.modelVersion
                });
            });

            content.content = optimizationResult.content;
            content.metadata.generationParameters = {
                ...content.metadata.generationParameters,
                optimizationTokenUsage: optimizationResult.usage
            };

            content.metrics.performance.push({
                type: MetricType.CONTENT_GENERATION_TIME,
                value: optimizationResult.performance.latencyMs,
                timestamp: new Date()
            });

            await this.validateGeneratedContent(content);

            return content;
        } catch (error) {
            this.logger.error('Content optimization failed', {
                error: error.message,
                contentId: content.id
            });
            throw error;
        } finally {
            span.end();
        }
    }

    private async validateMetadata(metadata: ContentMetadata): Promise<void> {
        if (!metadata.title || !metadata.description) {
            throw new Error('Invalid metadata: title and description are required');
        }

        if (!metadata.targetAudience || metadata.targetAudience.length === 0) {
            throw new Error('Invalid metadata: target audience is required');
        }

        if (!metadata.aiModel || !metadata.modelVersion) {
            throw new Error('Invalid metadata: AI model configuration is required');
        }
    }

    private async validateGeneratedContent(content: ContentModel): Promise<void> {
        if (!content.validate()) {
            throw new Error('Generated content failed validation');
        }
    }

    private buildGenerationPrompt(metadata: ContentMetadata): string {
        return `
            Title: ${metadata.title}
            Description: ${metadata.description}
            Target Audience: ${metadata.targetAudience.join(', ')}
            Keywords: ${metadata.keywords.join(', ')}
            Language: ${metadata.language}
            Custom Instructions: ${metadata.generationPrompt}
        `.trim();
    }

    private buildOptimizationPrompt(content: ContentModel): string {
        return `
            Original Content: ${content.content}
            Target Audience: ${content.metadata.targetAudience.join(', ')}
            Optimization Goals: Improve engagement and conversion rate
            Current Metrics: ${JSON.stringify(content.metrics)}
            Please optimize the content while maintaining the original message and tone.
        `.trim();
    }
}