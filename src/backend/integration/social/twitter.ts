import { injectable } from 'inversify';
import { TwitterApi } from 'twitter-api-v2'; // v1.15.0
import { Logger } from 'winston'; // v3.8.0
import retry from 'retry'; // v0.13.0
import { Span } from '@opentelemetry/api'; // v1.4.0
import { IContent, ContentMetrics, ContentStatus } from '../../common/interfaces/content.interface';
import { encryptData, decryptData } from '../../common/utils/encryption';
import { CustomError, ERROR_CODES, ERROR_SEVERITY } from '../../common/middleware/error';

/**
 * Enhanced interface for Twitter API credentials with rotation support
 */
interface TwitterCredentials {
    apiKey: string;
    apiSecret: string;
    accessToken: string;
    accessTokenSecret: string;
    rotationInterval: number;
    lastRotated: Date;
}

/**
 * Comprehensive metrics interface for Twitter content
 */
interface TwitterMetrics {
    impressions: number;
    engagements: number;
    clicks: number;
    retweets: number;
    replies: number;
    likes: number;
    demographicData: Record<string, any>;
    geographicData: Record<string, any>;
}

/**
 * Rate limiting configuration
 */
const RATE_LIMITS = {
    tweets: { window: 3600, limit: 300 },
    metrics: { window: 900, limit: 100 }
};

/**
 * Enhanced Twitter integration service with comprehensive security and monitoring
 */
@injectable()
export class TwitterService {
    private readonly client: TwitterApi;
    private readonly logger: Logger;
    private readonly monitoring: Span;
    private rateLimiters: Map<string, { count: number; resetTime: number }>;
    private metricsCache: Map<string, { data: TwitterMetrics; timestamp: number }>;

    constructor(
        private readonly credentials: TwitterCredentials,
        monitoring: Span,
        logger: Logger
    ) {
        this.logger = logger;
        this.monitoring = monitoring;
        this.rateLimiters = new Map();
        this.metricsCache = new Map();

        // Initialize Twitter client with encrypted credentials
        this.client = this.initializeClient();
        this.setupCredentialRotation();
        this.initializeRateLimiters();
    }

    /**
     * Initializes Twitter client with secure credential handling
     */
    private initializeClient(): TwitterApi {
        try {
            const decryptedCreds = this.decryptCredentials(this.credentials);
            return new TwitterApi({
                appKey: decryptedCreds.apiKey,
                appSecret: decryptedCreds.apiSecret,
                accessToken: decryptedCreds.accessToken,
                accessSecret: decryptedCreds.accessTokenSecret
            });
        } catch (error) {
            throw new CustomError(
                'Failed to initialize Twitter client',
                500,
                ERROR_CODES.INTERNAL_ERROR,
                undefined,
                ERROR_SEVERITY.HIGH
            );
        }
    }

    /**
     * Publishes content to Twitter with enhanced validation and monitoring
     */
    public async publishContent(content: IContent): Promise<boolean> {
        const span = this.monitoring.startSpan('twitter.publish');
        
        try {
            // Validate rate limits
            if (!this.checkRateLimit('tweets')) {
                throw new CustomError(
                    'Rate limit exceeded for Twitter publishing',
                    429,
                    ERROR_CODES.TRANSIENT_ERROR
                );
            }

            // Validate content
            this.validateContent(content);

            // Configure retry operation
            const operation = retry.operation({
                retries: 3,
                factor: 2,
                minTimeout: 1000,
                maxTimeout: 5000
            });

            return new Promise((resolve, reject) => {
                operation.attempt(async (currentAttempt) => {
                    try {
                        const tweet = await this.client.v2.tweet(content.content);
                        
                        this.logger.info('Content published to Twitter', {
                            contentId: content.id,
                            tweetId: tweet.data.id,
                            attempt: currentAttempt
                        });

                        // Update rate limiter
                        this.updateRateLimit('tweets');

                        span.setAttributes({
                            'twitter.tweet.id': tweet.data.id,
                            'twitter.publish.success': true
                        });

                        resolve(true);
                    } catch (error) {
                        if (operation.retry(error)) {
                            return;
                        }
                        reject(new CustomError(
                            `Failed to publish content: ${error.message}`,
                            500,
                            ERROR_CODES.INTERNAL_ERROR
                        ));
                    }
                });
            });
        } catch (error) {
            span.setAttributes({
                'twitter.publish.error': error.message,
                'twitter.publish.success': false
            });
            throw error;
        } finally {
            span.end();
        }
    }

    /**
     * Retrieves detailed performance metrics with caching
     */
    public async getMetrics(tweetId: string): Promise<ContentMetrics> {
        const span = this.monitoring.startSpan('twitter.metrics');

        try {
            // Check cache
            const cached = this.metricsCache.get(tweetId);
            if (cached && Date.now() - cached.timestamp < 300000) { // 5 minutes cache
                return this.transformMetrics(cached.data);
            }

            // Validate rate limits
            if (!this.checkRateLimit('metrics')) {
                throw new CustomError(
                    'Rate limit exceeded for metrics retrieval',
                    429,
                    ERROR_CODES.TRANSIENT_ERROR
                );
            }

            const tweetMetrics = await this.client.v2.get(
                `tweets/${tweetId}/metrics`,
                { expansions: ['public_metrics', 'non_public_metrics'] }
            );

            const metrics: TwitterMetrics = {
                impressions: tweetMetrics.data.impression_count,
                engagements: tweetMetrics.data.engagement_count,
                clicks: tweetMetrics.data.url_link_clicks,
                retweets: tweetMetrics.data.retweet_count,
                replies: tweetMetrics.data.reply_count,
                likes: tweetMetrics.data.like_count,
                demographicData: tweetMetrics.data.demographic_metrics || {},
                geographicData: tweetMetrics.data.geographic_metrics || {}
            };

            // Update cache
            this.metricsCache.set(tweetId, {
                data: metrics,
                timestamp: Date.now()
            });

            // Update rate limiter
            this.updateRateLimit('metrics');

            return this.transformMetrics(metrics);
        } catch (error) {
            span.setAttributes({
                'twitter.metrics.error': error.message,
                'twitter.metrics.success': false
            });
            throw new CustomError(
                `Failed to retrieve metrics: ${error.message}`,
                500,
                ERROR_CODES.INTERNAL_ERROR
            );
        } finally {
            span.end();
        }
    }

    /**
     * Private helper methods
     */
    private validateContent(content: IContent): void {
        if (!content.content || content.content.length > 280) {
            throw new CustomError(
                'Invalid content length for Twitter',
                400,
                ERROR_CODES.VALIDATION_ERROR
            );
        }
    }

    private async decryptCredentials(credentials: TwitterCredentials): Promise<TwitterCredentials> {
        return {
            ...credentials,
            apiKey: await decryptData(credentials.apiKey as any, process.env.ENCRYPTION_KEY as any),
            apiSecret: await decryptData(credentials.apiSecret as any, process.env.ENCRYPTION_KEY as any),
            accessToken: await decryptData(credentials.accessToken as any, process.env.ENCRYPTION_KEY as any),
            accessTokenSecret: await decryptData(credentials.accessTokenSecret as any, process.env.ENCRYPTION_KEY as any)
        } as TwitterCredentials;
    }

    private setupCredentialRotation(): void {
        setInterval(async () => {
            try {
                // Implement credential rotation logic
                this.credentials.lastRotated = new Date();
                this.client.refreshCredentials();
            } catch (error) {
                this.logger.error('Failed to rotate Twitter credentials', { error });
            }
        }, this.credentials.rotationInterval);
    }

    private initializeRateLimiters(): void {
        Object.keys(RATE_LIMITS).forEach(key => {
            this.rateLimiters.set(key, {
                count: 0,
                resetTime: Date.now() + (RATE_LIMITS[key].window * 1000)
            });
        });
    }

    private checkRateLimit(type: string): boolean {
        const limiter = this.rateLimiters.get(type);
        if (!limiter) return true;

        if (Date.now() > limiter.resetTime) {
            this.rateLimiters.set(type, {
                count: 0,
                resetTime: Date.now() + (RATE_LIMITS[type].window * 1000)
            });
            return true;
        }

        return limiter.count < RATE_LIMITS[type].limit;
    }

    private updateRateLimit(type: string): void {
        const limiter = this.rateLimiters.get(type);
        if (limiter) {
            limiter.count++;
            this.rateLimiters.set(type, limiter);
        }
    }

    private transformMetrics(twitterMetrics: TwitterMetrics): ContentMetrics {
        return {
            impressions: twitterMetrics.impressions,
            engagements: twitterMetrics.engagements,
            clicks: twitterMetrics.clicks,
            conversions: 0, // Twitter doesn't provide conversion data
            performance: [],
            platformSpecificMetrics: {
                retweets: twitterMetrics.retweets,
                replies: twitterMetrics.replies,
                likes: twitterMetrics.likes,
                demographicData: twitterMetrics.demographicData,
                geographicData: twitterMetrics.geographicData
            },
            aiPerformanceMetrics: {}
        };
    }
}