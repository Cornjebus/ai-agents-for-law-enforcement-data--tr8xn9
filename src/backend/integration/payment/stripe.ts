import Stripe from 'stripe'; // v12.0.0
import { Request, Response } from 'express'; // v4.18.0
import { IMetric, MetricType, MetricUnit } from '../../common/interfaces/metric.interface';
import { DATABASE_CONFIG } from '../../common/config/database';

/**
 * Enhanced configuration interface for Stripe integration with security settings
 */
export interface IStripeConfig {
    apiKey: string;
    webhookSecret: string;
    currency: string;
    apiVersion: string;
    timeout: number;
    maxRetries: number;
    idempotencyKeyPrefix: string;
}

/**
 * Comprehensive interface for payment intent data with enhanced metadata
 */
export interface IPaymentIntent {
    amount: number;
    currency: string;
    customerId: string;
    description: string;
    metadata: Record<string, string>;
    idempotencyKey: string;
    returnUrl: string;
    statementDescriptor: string;
}

/**
 * Enhanced service class for secure Stripe payment operations with comprehensive error handling and metrics tracking
 */
@Injectable()
export class StripeService {
    private readonly stripe: Stripe;
    private readonly metricsService: MetricsService;

    constructor(
        private readonly config: IStripeConfig,
        metricsService: MetricsService
    ) {
        this.validateConfig(config);
        this.stripe = new Stripe(config.apiKey, {
            apiVersion: config.apiVersion,
            typescript: true,
            timeout: config.timeout,
            maxNetworkRetries: config.maxRetries
        });
        this.metricsService = metricsService;
    }

    /**
     * Creates a new payment intent with enhanced error handling and metrics
     */
    async createPaymentIntent(paymentData: IPaymentIntent): Promise<Stripe.PaymentIntent> {
        const startTime = Date.now();
        const idempotencyKey = `${this.config.idempotencyKeyPrefix}-${paymentData.idempotencyKey}`;

        try {
            // Validate payment data
            this.validatePaymentData(paymentData);

            // Create payment intent with retry mechanism
            const paymentIntent = await this.stripe.paymentIntents.create(
                {
                    amount: paymentData.amount,
                    currency: paymentData.currency || this.config.currency,
                    customer: paymentData.customerId,
                    description: paymentData.description,
                    metadata: {
                        ...paymentData.metadata,
                        createdAt: new Date().toISOString()
                    },
                    statement_descriptor: paymentData.statementDescriptor,
                    return_url: paymentData.returnUrl,
                    automatic_payment_methods: { enabled: true }
                },
                {
                    idempotencyKey
                }
            );

            // Track payment metrics
            await this.trackPaymentMetrics({
                id: paymentIntent.id,
                name: 'payment_intent_creation',
                type: MetricType.LATENCY,
                value: Date.now() - startTime,
                unit: MetricUnit.MILLISECONDS,
                timestamp: new Date(),
                service: 'stripe',
                environment: process.env.NODE_ENV || 'development',
                metadata: {
                    amount: paymentData.amount,
                    currency: paymentData.currency,
                    status: paymentIntent.status
                },
                tags: {
                    customerId: paymentData.customerId,
                    paymentIntentId: paymentIntent.id
                }
            });

            return paymentIntent;
        } catch (error) {
            await this.handlePaymentError(error, 'createPaymentIntent', paymentData);
            throw error;
        }
    }

    /**
     * Enhanced webhook handler with signature verification and comprehensive event processing
     */
    async handleWebhook(req: Request, res: Response): Promise<void> {
        const startTime = Date.now();
        const signature = req.headers['stripe-signature'];

        try {
            if (!signature) {
                throw new Error('Missing Stripe signature');
            }

            // Verify webhook signature
            const event = this.stripe.webhooks.constructEvent(
                req.body,
                signature,
                this.config.webhookSecret
            );

            // Process different webhook events
            switch (event.type) {
                case 'payment_intent.succeeded':
                    await this.handlePaymentSuccess(event.data.object);
                    break;
                case 'payment_intent.failed':
                    await this.handlePaymentFailure(event.data.object);
                    break;
                case 'subscription.created':
                    await this.handleSubscriptionCreated(event.data.object);
                    break;
                // Add more event handlers as needed
            }

            // Track webhook processing metrics
            await this.trackPaymentMetrics({
                id: event.id,
                name: 'webhook_processing',
                type: MetricType.LATENCY,
                value: Date.now() - startTime,
                unit: MetricUnit.MILLISECONDS,
                timestamp: new Date(),
                service: 'stripe',
                environment: process.env.NODE_ENV || 'development',
                metadata: {
                    eventType: event.type,
                    processingTime: Date.now() - startTime
                },
                tags: {
                    eventId: event.id,
                    eventType: event.type
                }
            });

            res.json({ received: true });
        } catch (error) {
            await this.handlePaymentError(error, 'handleWebhook', { signature });
            res.status(400).json({ error: 'Webhook error' });
        }
    }

    /**
     * Creates and manages subscriptions with comprehensive lifecycle handling
     */
    async createSubscription(
        customerId: string,
        priceId: string,
        options: Stripe.SubscriptionCreateParams
    ): Promise<Stripe.Subscription> {
        const startTime = Date.now();
        const idempotencyKey = `${this.config.idempotencyKeyPrefix}-sub-${customerId}-${priceId}`;

        try {
            // Create subscription with retry mechanism
            const subscription = await this.stripe.subscriptions.create(
                {
                    customer: customerId,
                    items: [{ price: priceId }],
                    ...options,
                    metadata: {
                        ...options.metadata,
                        createdAt: new Date().toISOString()
                    }
                },
                {
                    idempotencyKey
                }
            );

            // Track subscription metrics
            await this.trackPaymentMetrics({
                id: subscription.id,
                name: 'subscription_creation',
                type: MetricType.LATENCY,
                value: Date.now() - startTime,
                unit: MetricUnit.MILLISECONDS,
                timestamp: new Date(),
                service: 'stripe',
                environment: process.env.NODE_ENV || 'development',
                metadata: {
                    customerId,
                    priceId,
                    status: subscription.status
                },
                tags: {
                    subscriptionId: subscription.id,
                    customerId
                }
            });

            return subscription;
        } catch (error) {
            await this.handlePaymentError(error, 'createSubscription', { customerId, priceId });
            throw error;
        }
    }

    /**
     * Enhanced payment metrics tracking with detailed analytics
     */
    private async trackPaymentMetrics(metric: IMetric): Promise<void> {
        try {
            await this.metricsService.trackMetric(metric);
        } catch (error) {
            console.error('Error tracking payment metrics:', error);
        }
    }

    /**
     * Validates Stripe configuration parameters
     */
    private validateConfig(config: IStripeConfig): void {
        if (!config.apiKey) throw new Error('Stripe API key is required');
        if (!config.webhookSecret) throw new Error('Stripe webhook secret is required');
        if (!config.currency) throw new Error('Default currency is required');
        if (!config.apiVersion) throw new Error('Stripe API version is required');
    }

    /**
     * Validates payment data before processing
     */
    private validatePaymentData(data: IPaymentIntent): void {
        if (!data.amount || data.amount <= 0) throw new Error('Invalid payment amount');
        if (!data.customerId) throw new Error('Customer ID is required');
        if (!data.idempotencyKey) throw new Error('Idempotency key is required');
    }

    /**
     * Handles payment success events
     */
    private async handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent): Promise<void> {
        // Implement payment success logic
        await this.trackPaymentMetrics({
            id: paymentIntent.id,
            name: 'payment_success',
            type: MetricType.REVENUE,
            value: paymentIntent.amount,
            unit: MetricUnit.DOLLARS,
            timestamp: new Date(),
            service: 'stripe',
            environment: process.env.NODE_ENV || 'development',
            metadata: {
                status: paymentIntent.status,
                paymentMethod: paymentIntent.payment_method_types[0]
            },
            tags: {
                paymentIntentId: paymentIntent.id,
                customerId: paymentIntent.customer as string
            }
        });
    }

    /**
     * Handles payment failure events
     */
    private async handlePaymentFailure(paymentIntent: Stripe.PaymentIntent): Promise<void> {
        // Implement payment failure logic
        await this.trackPaymentMetrics({
            id: paymentIntent.id,
            name: 'payment_failure',
            type: MetricType.ERROR_RATE,
            value: 1,
            unit: MetricUnit.COUNT,
            timestamp: new Date(),
            service: 'stripe',
            environment: process.env.NODE_ENV || 'development',
            metadata: {
                status: paymentIntent.status,
                error: paymentIntent.last_payment_error
            },
            tags: {
                paymentIntentId: paymentIntent.id,
                customerId: paymentIntent.customer as string
            }
        });
    }

    /**
     * Handles subscription creation events
     */
    private async handleSubscriptionCreated(subscription: Stripe.Subscription): Promise<void> {
        // Implement subscription creation logic
        await this.trackPaymentMetrics({
            id: subscription.id,
            name: 'subscription_created',
            type: MetricType.REVENUE,
            value: subscription.items.data[0].price.unit_amount || 0,
            unit: MetricUnit.DOLLARS,
            timestamp: new Date(),
            service: 'stripe',
            environment: process.env.NODE_ENV || 'development',
            metadata: {
                status: subscription.status,
                interval: subscription.items.data[0].price.recurring?.interval
            },
            tags: {
                subscriptionId: subscription.id,
                customerId: subscription.customer as string
            }
        });
    }

    /**
     * Comprehensive error handling for payment operations
     */
    private async handlePaymentError(error: any, operation: string, context: any): Promise<void> {
        await this.trackPaymentMetrics({
            id: `error-${Date.now()}`,
            name: `payment_error_${operation}`,
            type: MetricType.ERROR_RATE,
            value: 1,
            unit: MetricUnit.COUNT,
            timestamp: new Date(),
            service: 'stripe',
            environment: process.env.NODE_ENV || 'development',
            metadata: {
                error: error.message,
                code: error.code,
                context
            },
            tags: {
                operation,
                errorType: error.type
            }
        });
        console.error(`Stripe ${operation} error:`, error);
    }
}