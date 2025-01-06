import * as paypal from '@paypal/checkout-server-sdk';
import axios, { AxiosInstance } from 'axios';
import winston from 'winston';
import { injectable, inject } from 'inversify';
import { IMetric, MetricType, MetricUnit } from '../../common/interfaces/metric.interface';

/**
 * PayPal environment types
 */
export enum PayPalEnvironment {
    SANDBOX = 'SANDBOX',
    PRODUCTION = 'PRODUCTION'
}

/**
 * Enhanced PayPal transaction statuses
 */
export enum PayPalTransactionStatus {
    COMPLETED = 'COMPLETED',
    PENDING = 'PENDING',
    FAILED = 'FAILED',
    REFUNDED = 'REFUNDED',
    PARTIALLY_REFUNDED = 'PARTIALLY_REFUNDED',
    PROCESSING = 'PROCESSING',
    EXPIRED = 'EXPIRED',
    CANCELLED = 'CANCELLED'
}

/**
 * PayPal configuration interface with enhanced security options
 */
export interface PayPalConfig {
    clientId: string;
    clientSecret: string;
    environment: PayPalEnvironment;
    webhookId: string;
    maxRetries: number;
    timeout: number;
    rateLimitDelay: number;
}

/**
 * Enhanced PayPal transaction interface with detailed tracking
 */
export interface PayPalTransaction {
    id: string;
    amount: number;
    currency: string;
    status: PayPalTransactionStatus;
    createdAt: Date;
    metadata: Record<string, unknown>;
    errorDetails?: PayPalError;
    retryCount: number;
    processingTime: number;
}

/**
 * PayPal error interface for enhanced error handling
 */
interface PayPalError {
    code: string;
    message: string;
    details?: Record<string, unknown>;
    timestamp: Date;
}

/**
 * Enhanced PayPal service for handling payment operations
 */
@injectable()
export class PayPalService {
    private client: paypal.core.PayPalHttpClient;
    private axiosInstance: AxiosInstance;
    private logger: winston.Logger;
    private metrics: Map<string, IMetric>;
    private retryDelay = 1000;

    constructor(
        private readonly config: PayPalConfig,
        @inject('MetricCollector') private readonly metricCollector: any,
        @inject('CacheService') private readonly cacheService: any
    ) {
        this.initializeService();
    }

    /**
     * Initialize PayPal service with enhanced configuration
     */
    private initializeService(): void {
        // Configure PayPal environment
        const environment = this.config.environment === PayPalEnvironment.PRODUCTION
            ? new paypal.core.LiveEnvironment(this.config.clientId, this.config.clientSecret)
            : new paypal.core.SandboxEnvironment(this.config.clientId, this.config.clientSecret);

        this.client = new paypal.core.PayPalHttpClient(environment);

        // Initialize axios instance with interceptors
        this.axiosInstance = axios.create({
            timeout: this.config.timeout,
            headers: { 'Content-Type': 'application/json' }
        });

        // Configure logger
        this.logger = winston.createLogger({
            level: 'info',
            format: winston.format.json(),
            transports: [
                new winston.transports.Console(),
                new winston.transports.File({ filename: 'paypal-error.log', level: 'error' })
            ]
        });

        this.metrics = new Map();
    }

    /**
     * Create a new payment with enhanced validation and error handling
     */
    public async createPayment(
        amount: number,
        currency: string,
        description: string,
        options: Record<string, unknown> = {}
    ): Promise<PayPalTransaction> {
        const startTime = Date.now();
        let retryCount = 0;

        try {
            this.validatePaymentParams(amount, currency);

            const request = new paypal.orders.OrdersCreateRequest();
            request.requestBody({
                intent: 'CAPTURE',
                purchase_units: [{
                    amount: {
                        currency_code: currency,
                        value: amount.toString()
                    },
                    description
                }],
                ...options
            });

            const response = await this.executeWithRetry(
                () => this.client.execute(request),
                this.config.maxRetries
            );

            const transaction: PayPalTransaction = {
                id: response.result.id,
                amount,
                currency,
                status: PayPalTransactionStatus.PROCESSING,
                createdAt: new Date(),
                metadata: options,
                retryCount,
                processingTime: Date.now() - startTime
            };

            await this.trackMetrics('payment_creation', transaction);
            await this.cacheService.set(`payment:${transaction.id}`, transaction);

            return transaction;
        } catch (error) {
            this.handlePaymentError(error, 'createPayment');
            throw error;
        }
    }

    /**
     * Capture an authorized payment
     */
    public async capturePayment(paymentId: string): Promise<PayPalTransaction> {
        const startTime = Date.now();

        try {
            const request = new paypal.orders.OrdersCaptureRequest(paymentId);
            const response = await this.executeWithRetry(
                () => this.client.execute(request),
                this.config.maxRetries
            );

            const transaction: PayPalTransaction = {
                id: paymentId,
                amount: parseFloat(response.result.purchase_units[0].amount.value),
                currency: response.result.purchase_units[0].amount.currency_code,
                status: PayPalTransactionStatus.COMPLETED,
                createdAt: new Date(),
                metadata: response.result,
                retryCount: 0,
                processingTime: Date.now() - startTime
            };

            await this.trackMetrics('payment_capture', transaction);
            await this.cacheService.set(`payment:${transaction.id}`, transaction);

            return transaction;
        } catch (error) {
            this.handlePaymentError(error, 'capturePayment');
            throw error;
        }
    }

    /**
     * Handle PayPal webhooks
     */
    public async handleWebhook(
        headers: Record<string, string>,
        payload: Record<string, unknown>
    ): Promise<void> {
        try {
            // Verify webhook signature
            const isValid = await this.verifyWebhookSignature(headers, payload);
            if (!isValid) {
                throw new Error('Invalid webhook signature');
            }

            // Process webhook event
            await this.processWebhookEvent(payload);
            await this.trackMetrics('webhook_processed', { eventType: payload.event_type });
        } catch (error) {
            this.handlePaymentError(error, 'handleWebhook');
            throw error;
        }
    }

    /**
     * Execute operation with retry mechanism
     */
    private async executeWithRetry<T>(
        operation: () => Promise<T>,
        maxRetries: number
    ): Promise<T> {
        let lastError: Error;
        for (let attempt = 0; attempt < maxRetries; attempt++) {
            try {
                return await operation();
            } catch (error) {
                lastError = error as Error;
                if (!this.isRetryableError(error)) {
                    throw error;
                }
                await this.delay(this.retryDelay * Math.pow(2, attempt));
            }
        }
        throw lastError!;
    }

    /**
     * Track payment metrics
     */
    private async trackMetrics(
        operation: string,
        data: Record<string, unknown>
    ): Promise<void> {
        const metric: IMetric = {
            id: `paypal_${operation}_${Date.now()}`,
            name: `PayPal ${operation}`,
            type: MetricType.REVENUE,
            value: data.amount as number || 0,
            unit: MetricUnit.DOLLARS,
            timestamp: new Date(),
            service: 'paypal',
            environment: this.config.environment,
            metadata: data,
            tags: {
                operation,
                status: data.status as string
            }
        };

        await this.metricCollector.collect(metric);
    }

    /**
     * Validate payment parameters
     */
    private validatePaymentParams(amount: number, currency: string): void {
        if (amount <= 0) {
            throw new Error('Invalid payment amount');
        }
        if (!currency.match(/^[A-Z]{3}$/)) {
            throw new Error('Invalid currency code');
        }
    }

    /**
     * Handle payment errors
     */
    private handlePaymentError(error: any, operation: string): void {
        const paypalError: PayPalError = {
            code: error.code || 'UNKNOWN_ERROR',
            message: error.message,
            details: error.details,
            timestamp: new Date()
        };

        this.logger.error('PayPal operation failed', {
            operation,
            error: paypalError,
            timestamp: new Date()
        });

        throw error;
    }

    /**
     * Verify webhook signature
     */
    private async verifyWebhookSignature(
        headers: Record<string, string>,
        payload: Record<string, unknown>
    ): Promise<boolean> {
        // Implementation of PayPal webhook signature verification
        return true; // Placeholder for actual implementation
    }

    /**
     * Process webhook event
     */
    private async processWebhookEvent(
        payload: Record<string, unknown>
    ): Promise<void> {
        // Implementation of webhook event processing
    }

    /**
     * Check if error is retryable
     */
    private isRetryableError(error: any): boolean {
        const retryableCodes = ['RESOURCE_NOT_AVAILABLE', 'INTERNAL_SERVER_ERROR'];
        return retryableCodes.includes(error.code) || error.message.includes('timeout');
    }

    /**
     * Delay helper
     */
    private delay(ms: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}