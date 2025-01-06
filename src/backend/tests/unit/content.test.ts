import { describe, test, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { performance } from 'perf_hooks';
import { ContentModel } from '../../services/content/models/content.model';
import { ContentGenerationService } from '../../services/content/services/generation.service';
import { ContentDistributionService } from '../../services/content/services/distribution.service';
import { ContentType, ContentPlatform } from '../../common/interfaces/campaign.interface';
import { ContentStatus, ContentMetadata } from '../../common/interfaces/content.interface';
import { MetricType } from '../../common/interfaces/metric.interface';

// Mock dependencies
jest.mock('../../services/content/models/content.model');
jest.mock('../../services/content/services/generation.service');
jest.mock('../../services/content/services/distribution.service');

describe('Content Model Tests', () => {
    let contentModel: ContentModel;
    const mockContent = {
        id: '123e4567-e89b-12d3-a456-426614174000',
        campaignId: '123e4567-e89b-12d3-a456-426614174001',
        type: ContentType.TEXT,
        platform: ContentPlatform.LINKEDIN,
        content: 'Test content',
        metadata: {
            title: 'Test Title',
            description: 'Test Description',
            keywords: ['test', 'content'],
            language: 'en',
            targetAudience: ['B2B'],
            aiModel: 'gpt-4',
            generationPrompt: 'Create engaging content',
            modelVersion: '1.0',
            generationParameters: {}
        },
        status: ContentStatus.DRAFT
    };

    beforeEach(() => {
        contentModel = new ContentModel(mockContent);
    });

    test('should validate content model initialization', () => {
        expect(contentModel.id).toBeDefined();
        expect(contentModel.type).toBe(ContentType.TEXT);
        expect(contentModel.platform).toBe(ContentPlatform.LINKEDIN);
        expect(contentModel.status).toBe(ContentStatus.DRAFT);
    });

    test('should validate content against platform rules', () => {
        const isValid = contentModel.validate();
        expect(isValid).toBe(true);
    });

    test('should reject invalid content length', () => {
        contentModel.content = 'a'.repeat(3001); // LinkedIn max length is 3000
        const isValid = contentModel.validate();
        expect(isValid).toBe(false);
    });

    test('should update metrics with performance tracking', () => {
        const metrics = [{
            type: MetricType.CONTENT_GENERATION_TIME,
            value: 1500,
            timestamp: new Date()
        }];
        contentModel.updateMetrics(metrics);
        expect(contentModel.metrics.performance).toContainEqual(expect.objectContaining({
            type: MetricType.CONTENT_GENERATION_TIME
        }));
    });

    test('should handle valid status transitions', () => {
        contentModel.updateStatus(ContentStatus.PENDING_APPROVAL);
        expect(contentModel.status).toBe(ContentStatus.PENDING_APPROVAL);
    });

    test('should reject invalid status transitions', () => {
        expect(() => {
            contentModel.updateStatus(ContentStatus.PUBLISHED);
        }).toThrow();
    });
});

describe('Content Generation Service Tests', () => {
    let generationService: ContentGenerationService;
    let mockOpenAIService: jest.Mock;
    let mockLogger: jest.Mock;
    let mockCircuitBreaker: jest.Mock;
    let mockTelemetry: jest.Mock;

    beforeEach(() => {
        mockOpenAIService = jest.fn();
        mockLogger = jest.fn();
        mockCircuitBreaker = jest.fn();
        mockTelemetry = jest.fn();
        generationService = new ContentGenerationService(
            mockOpenAIService,
            mockLogger,
            mockCircuitBreaker,
            mockTelemetry
        );
    });

    test('should generate content within performance benchmarks', async () => {
        const metadata: ContentMetadata = {
            title: 'Performance Test',
            description: 'Testing generation performance',
            keywords: ['test'],
            language: 'en',
            targetAudience: ['B2B'],
            aiModel: 'gpt-4',
            generationPrompt: 'Create high-performance content',
            modelVersion: '1.0',
            generationParameters: {
                temperature: 0.7,
                maxTokens: 2000
            }
        };

        const startTime = performance.now();
        const content = await generationService.generateContent(metadata);
        const endTime = performance.now();
        const generationTime = endTime - startTime;

        expect(generationTime).toBeLessThan(2000); // 2 seconds max
        expect(content).toBeDefined();
        expect(content.validate()).toBe(true);
    });

    test('should handle streaming content generation', async () => {
        const metadata: ContentMetadata = {
            title: 'Streaming Test',
            description: 'Testing streaming generation',
            keywords: ['test'],
            language: 'en',
            targetAudience: ['B2B'],
            aiModel: 'gpt-4',
            generationPrompt: 'Create streaming content',
            modelVersion: '1.0',
            generationParameters: {}
        };

        const stream = generationService.streamGenerateContent(metadata);
        const chunks: string[] = [];

        for await (const chunk of stream) {
            chunks.push(chunk);
        }

        expect(chunks.length).toBeGreaterThan(0);
        expect(chunks.join('')).toBeTruthy();
    });

    test('should optimize content with AI model', async () => {
        const mockContent = new ContentModel({
            content: 'Initial content',
            metadata: {
                aiModel: 'gpt-4',
                modelVersion: '1.0'
            }
        });

        const optimizedContent = await generationService.optimizeContent(mockContent);
        expect(optimizedContent.content).not.toBe(mockContent.content);
        expect(optimizedContent.metadata.generationParameters.optimizationTokenUsage).toBeDefined();
    });
});

describe('Content Distribution Service Tests', () => {
    let distributionService: ContentDistributionService;
    let mockContent: ContentModel;

    beforeEach(() => {
        distributionService = new ContentDistributionService(
            jest.fn(),
            jest.fn(),
            jest.fn()
        );

        mockContent = new ContentModel({
            id: '123e4567-e89b-12d3-a456-426614174000',
            type: ContentType.TEXT,
            platform: ContentPlatform.LINKEDIN,
            content: 'Test distribution content',
            status: ContentStatus.APPROVED
        });
    });

    test('should distribute content to platform', async () => {
        const result = await distributionService.distributeContent(mockContent);
        expect(result).toBe(true);
        expect(mockContent.status).toBe(ContentStatus.PUBLISHED);
    });

    test('should collect platform metrics', async () => {
        const metrics = await distributionService.collectMetrics(mockContent);
        expect(metrics).toBeDefined();
        expect(metrics.impressions).toBeGreaterThanOrEqual(0);
        expect(metrics.engagements).toBeGreaterThanOrEqual(0);
    });

    test('should schedule content distribution', async () => {
        const scheduledTime = new Date(Date.now() + 3600000); // 1 hour from now
        const result = await distributionService.scheduleDistribution(mockContent, scheduledTime);
        expect(result).toBe(true);
        expect(mockContent.status).toBe(ContentStatus.SCHEDULED);
        expect(mockContent.scheduledFor).toBeDefined();
    });

    test('should validate platform-specific rules', async () => {
        mockContent.platform = ContentPlatform.TWITTER;
        mockContent.content = 'a'.repeat(281); // Twitter's 280 character limit
        const result = await distributionService.distributeContent(mockContent);
        expect(result).toBe(false);
    });
});

describe('Performance Benchmark Tests', () => {
    test('should meet API response time requirements', async () => {
        const startTime = performance.now();
        const content = new ContentModel({
            type: ContentType.TEXT,
            platform: ContentPlatform.LINKEDIN,
            content: 'Performance test content'
        });
        
        const isValid = content.validate();
        const endTime = performance.now();
        const responseTime = endTime - startTime;

        expect(responseTime).toBeLessThan(100); // 100ms max
        expect(isValid).toBe(true);
    });

    test('should meet content generation time requirements', async () => {
        const generationService = new ContentGenerationService(
            jest.fn(),
            jest.fn(),
            jest.fn(),
            jest.fn()
        );

        const startTime = performance.now();
        const content = await generationService.generateContent({
            title: 'Performance Test',
            description: 'Testing generation speed',
            keywords: ['test'],
            language: 'en',
            targetAudience: ['B2B'],
            aiModel: 'gpt-4',
            generationPrompt: 'Create fast content',
            modelVersion: '1.0',
            generationParameters: {}
        });
        const endTime = performance.now();
        const generationTime = endTime - startTime;

        expect(generationTime).toBeLessThan(2000); // 2 seconds max
        expect(content).toBeDefined();
    });
});