import { injectable } from 'tsyringe'; // v4.8.0
import { Request, Response } from 'express'; // v4.18.0
import asyncHandler from 'express-async-handler'; // v1.2.0
import rateLimit from 'express-rate-limit'; // v6.7.0
import compression from 'compression'; // v1.7.4
import { CacheManager } from 'cache-manager'; // v5.2.0

import { CampaignModel } from '../models/campaign.model';
import { OptimizationService } from '../services/optimization.service';
import { TargetingService } from '../services/targeting.service';
import { CustomError } from '../../../common/middleware/error';

import {
    Campaign,
    CampaignStatus,
    CampaignType,
    CampaignConfig,
    CampaignTargeting,
    CampaignAIConfig
} from '../../../common/interfaces/campaign.interface';

/**
 * Enhanced controller for campaign management with AI optimization capabilities
 * @version 1.0.0
 */
@injectable()
export class CampaignController {
    private readonly CACHE_TTL = 300; // 5 minutes cache duration
    private readonly RATE_LIMIT = {
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100 // limit each IP to 100 requests per windowMs
    };

    constructor(
        private readonly campaignModel: CampaignModel,
        private readonly optimizationService: OptimizationService,
        private readonly targetingService: TargetingService,
        private readonly cacheManager: CacheManager
    ) {}

    /**
     * Creates a new campaign with AI-driven optimization
     */
    @asyncHandler
    public async createCampaign(req: Request, res: Response): Promise<void> {
        const { organizationId } = req.user;
        const campaignData: Partial<Campaign> = req.body;

        // Validate campaign configuration
        this.validateCampaignData(campaignData);

        // Initialize AI configuration
        const aiConfig: CampaignAIConfig = {
            modelType: 'GPT4',
            temperature: 0.7,
            maxTokens: 8000,
            customPrompts: {},
            contextWindow: 100000,
            optimizationGoals: ['conversion_rate', 'revenue'],
            learningRate: 0.01,
            retrainingInterval: 24
        };

        // Create campaign with enhanced configuration
        const campaign = await this.campaignModel.create({
            ...campaignData,
            organizationId,
            status: CampaignStatus.DRAFT,
            aiConfig,
            createdAt: new Date(),
            updatedAt: new Date()
        });

        // Generate initial performance predictions
        const predictions = await this.optimizationService.predictPerformance(campaign.id);

        // Analyze targeting effectiveness
        const targetingAnalysis = await this.targetingService.analyzeCampaignTargeting(campaign.id);

        // Cache campaign data
        await this.cacheManager.set(
            `campaign:${campaign.id}`,
            campaign,
            this.CACHE_TTL
        );

        res.status(201).json({
            success: true,
            data: {
                campaign,
                predictions,
                targetingAnalysis,
                recommendations: await this.optimizationService.generateInsights(campaign.id)
            }
        });
    }

    /**
     * Retrieves campaign details with performance metrics
     */
    @asyncHandler
    public async getCampaign(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        const { organizationId } = req.user;

        // Check cache first
        const cachedCampaign = await this.cacheManager.get(`campaign:${id}`);
        if (cachedCampaign) {
            res.json({ success: true, data: cachedCampaign });
            return;
        }

        // Fetch campaign with authorization check
        const campaign = await this.campaignModel.findById(id);
        if (!campaign) {
            throw new CustomError('Campaign not found', 404);
        }

        if (campaign.organizationId !== organizationId) {
            throw new CustomError('Unauthorized access', 403);
        }

        // Get real-time performance metrics
        const metrics = await this.optimizationService.analyzePerformance(id);

        // Get targeting effectiveness
        const targeting = await this.targetingService.analyzeCampaignTargeting(id);

        const response = {
            campaign,
            metrics,
            targeting,
            recommendations: await this.optimizationService.generateInsights(id)
        };

        // Cache the response
        await this.cacheManager.set(
            `campaign:${id}`,
            response,
            this.CACHE_TTL
        );

        res.json({ success: true, data: response });
    }

    /**
     * Updates campaign configuration with optimization
     */
    @asyncHandler
    public async updateCampaign(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        const { organizationId } = req.user;
        const updates = req.body;

        // Validate update data
        this.validateCampaignData(updates);

        const campaign = await this.campaignModel.findById(id);
        if (!campaign) {
            throw new CustomError('Campaign not found', 404);
        }

        if (campaign.organizationId !== organizationId) {
            throw new CustomError('Unauthorized access', 403);
        }

        // Validate date constraints
        if (updates.startDate || updates.endDate) {
            await this.campaignModel.validateDates();
        }

        // Update campaign with optimization
        const updatedCampaign = await this.campaignModel.update(id, {
            ...updates,
            updatedAt: new Date()
        });

        // Optimize targeting if needed
        if (updates.targeting) {
            await this.targetingService.optimizeTargeting(id, updates.targeting);
        }

        // Invalidate cache
        await this.cacheManager.del(`campaign:${id}`);

        res.json({
            success: true,
            data: {
                campaign: updatedCampaign,
                recommendations: await this.optimizationService.generateInsights(id)
            }
        });
    }

    /**
     * Updates campaign status with validation
     */
    @asyncHandler
    public async updateCampaignStatus(req: Request, res: Response): Promise<void> {
        const { id } = req.params;
        const { status } = req.body;
        const { organizationId } = req.user;

        const campaign = await this.campaignModel.findById(id);
        if (!campaign) {
            throw new CustomError('Campaign not found', 404);
        }

        if (campaign.organizationId !== organizationId) {
            throw new CustomError('Unauthorized access', 403);
        }

        // Update status with validation
        await this.campaignModel.updateStatus(status);

        // Invalidate cache
        await this.cacheManager.del(`campaign:${id}`);

        res.json({
            success: true,
            data: {
                status,
                updatedAt: new Date()
            }
        });
    }

    /**
     * Validates campaign data against schema
     */
    private validateCampaignData(data: Partial<Campaign>): void {
        if (data.type && !Object.values(CampaignType).includes(data.type)) {
            throw new CustomError('Invalid campaign type', 400);
        }

        if (data.configuration) {
            this.validateCampaignConfig(data.configuration);
        }

        if (data.targeting) {
            this.validateTargeting(data.targeting);
        }
    }

    /**
     * Validates campaign configuration
     */
    private validateCampaignConfig(config: CampaignConfig): void {
        if (!config.channels || !Array.isArray(config.channels)) {
            throw new CustomError('Invalid channels configuration', 400);
        }

        if (!config.content || !Array.isArray(config.content)) {
            throw new CustomError('Invalid content configuration', 400);
        }

        if (!config.schedule || !config.schedule.timezone) {
            throw new CustomError('Invalid schedule configuration', 400);
        }
    }

    /**
     * Validates targeting configuration
     */
    private validateTargeting(targeting: CampaignTargeting): void {
        if (!targeting.audience || !targeting.audience.industries) {
            throw new CustomError('Invalid targeting configuration', 400);
        }

        if (targeting.exclusions && !Array.isArray(targeting.exclusions.industries)) {
            throw new CustomError('Invalid exclusions configuration', 400);
        }
    }
}