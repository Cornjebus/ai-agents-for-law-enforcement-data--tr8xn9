import { 
    controller, 
    Post, 
    Get, 
    UseGuards, 
    UseInterceptors, 
    UsePipes 
} from '@nestjs/common';
import { injectable } from 'inversify';
import { Logger } from 'winston';
import { RateLimit } from '@nestjs/throttler';
import { CircuitBreaker } from '@nestjs/circuit-breaker';
import { StreamableFile } from '@nestjs/common';

import { ContentModel } from '../models/content.model';
import { ContentGenerationService } from '../services/generation.service';
import { ContentDistributionService } from '../services/distribution.service';
import { IContent, ContentStatus } from '../../../common/interfaces/content.interface';
import { MetricType } from '../../../common/interfaces/metric.interface';

@controller('api/v1/content')
@injectable()
@UseGuards(AuthGuard)
@UseInterceptors(LoggingInterceptor, CacheInterceptor)
@UsePipes(ValidationPipe)
export class ContentController {
    private readonly logger: Logger;
    private readonly circuitBreaker: CircuitBreaker;

    constructor(
        private readonly contentGenerationService: ContentGenerationService,
        private readonly contentDistributionService: ContentDistributionService,
        private readonly metrics: MetricsService
    ) {
        this.logger = createLogger({
            level: 'info',
            defaultMeta: { service: 'content-controller' }
        });

        this.circuitBreaker = new CircuitBreaker({
            timeout: 30000,
            errorThresholdPercentage: 50,
            resetTimeout: 30000
        });
    }

    @Post('/')
    @UseGuards(RateLimitGuard)
    @UsePipes(ContentValidationPipe)
    async createContent(createContentDto: CreateContentDto): Promise<ContentModel> {
        const startTime = Date.now();
        const correlationId = uuidv4();

        try {
            this.logger.info('Starting content creation', {
                correlationId,
                contentType: createContentDto.type
            });

            // Validate input
            const validationResult = await ContentModel.validate(createContentDto);
            if (!validationResult.isValid) {
                throw new ValidationError(validationResult.errors);
            }

            // Generate content with circuit breaker protection
            const content = await this.circuitBreaker.fire(async () => {
                return this.contentGenerationService.generateContent({
                    ...createContentDto,
                    metadata: {
                        ...createContentDto.metadata,
                        generationStartTime: new Date(),
                        correlationId
                    }
                });
            });

            // Record metrics
            const duration = Date.now() - startTime;
            await this.metrics.recordMetric({
                type: MetricType.CONTENT_GENERATION_TIME,
                value: duration,
                metadata: {
                    contentId: content.id,
                    contentType: content.type,
                    status: content.status
                }
            });

            this.logger.info('Content created successfully', {
                correlationId,
                contentId: content.id,
                duration
            });

            return content;
        } catch (error) {
            this.logger.error('Content creation failed', {
                correlationId,
                error: error.message,
                stack: error.stack
            });

            // Record error metrics
            await this.metrics.recordMetric({
                type: MetricType.ERROR_RATE,
                value: 1,
                metadata: {
                    operation: 'content_creation',
                    errorType: error.name
                }
            });

            throw error;
        }
    }

    @Post('/stream')
    @UseGuards(RateLimitGuard)
    @UseInterceptors(StreamingInterceptor)
    async streamContent(createContentDto: CreateContentDto): Promise<StreamableFile> {
        const correlationId = uuidv4();

        try {
            this.logger.info('Starting content streaming', {
                correlationId,
                contentType: createContentDto.type
            });

            // Initialize streaming response
            const stream = await this.contentGenerationService.streamGenerateContent({
                ...createContentDto,
                metadata: {
                    ...createContentDto.metadata,
                    streamStartTime: new Date(),
                    correlationId
                }
            });

            return new StreamableFile(stream);
        } catch (error) {
            this.logger.error('Content streaming failed', {
                correlationId,
                error: error.message
            });
            throw error;
        }
    }

    @Post('/:contentId/distribute')
    @UseGuards(RateLimitGuard)
    @UseInterceptors(CircuitBreakerInterceptor)
    async distributeContent(
        contentId: string,
        distributeDto: DistributeContentDto
    ): Promise<DistributionResult> {
        const correlationId = uuidv4();

        try {
            this.logger.info('Starting content distribution', {
                correlationId,
                contentId,
                platforms: distributeDto.platforms
            });

            // Validate content for distribution
            const content = await ContentModel.validateDistribution(contentId);
            if (!content) {
                throw new NotFoundError('Content not found');
            }

            // Distribute content with circuit breaker protection
            const result = await this.circuitBreaker.fire(async () => {
                return this.contentDistributionService.distributeContent({
                    ...content,
                    distributionConfig: distributeDto,
                    metadata: {
                        ...content.metadata,
                        distributionStartTime: new Date(),
                        correlationId
                    }
                });
            });

            // Record distribution metrics
            await this.metrics.recordMetric({
                type: MetricType.THROUGHPUT,
                value: 1,
                metadata: {
                    contentId,
                    platforms: distributeDto.platforms,
                    status: 'success'
                }
            });

            this.logger.info('Content distributed successfully', {
                correlationId,
                contentId,
                result
            });

            return result;
        } catch (error) {
            this.logger.error('Content distribution failed', {
                correlationId,
                contentId,
                error: error.message
            });

            // Record error metrics
            await this.metrics.recordMetric({
                type: MetricType.ERROR_RATE,
                value: 1,
                metadata: {
                    operation: 'content_distribution',
                    errorType: error.name
                }
            });

            throw error;
        }
    }

    @Get('/:contentId/metrics')
    @UseGuards(RateLimitGuard)
    @UseInterceptors(CacheInterceptor)
    async getContentMetrics(contentId: string): Promise<ContentMetrics> {
        const correlationId = uuidv4();

        try {
            this.logger.info('Fetching content metrics', {
                correlationId,
                contentId
            });

            const metrics = await this.contentDistributionService.collectMetrics(contentId);

            this.logger.info('Metrics retrieved successfully', {
                correlationId,
                contentId,
                metricsCount: Object.keys(metrics).length
            });

            return metrics;
        } catch (error) {
            this.logger.error('Failed to fetch metrics', {
                correlationId,
                contentId,
                error: error.message
            });
            throw error;
        }
    }

    @Post('/:contentId/optimize')
    @UseGuards(RateLimitGuard)
    async optimizeContent(contentId: string): Promise<ContentModel> {
        const correlationId = uuidv4();

        try {
            this.logger.info('Starting content optimization', {
                correlationId,
                contentId
            });

            const optimizedContent = await this.contentGenerationService.optimizeContent(contentId);

            this.logger.info('Content optimized successfully', {
                correlationId,
                contentId,
                optimizationScore: optimizedContent.metrics.aiPerformanceMetrics.optimizationScore
            });

            return optimizedContent;
        } catch (error) {
            this.logger.error('Content optimization failed', {
                correlationId,
                contentId,
                error: error.message
            });
            throw error;
        }
    }
}