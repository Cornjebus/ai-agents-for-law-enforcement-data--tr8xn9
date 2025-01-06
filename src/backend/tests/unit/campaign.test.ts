import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals'; // v29.6.2
import { CampaignModel } from '../../services/campaign/models/campaign.model';
import { OptimizationService } from '../../services/campaign/services/optimization.service';
import { TargetingService } from '../../services/campaign/services/targeting.service';
import { CampaignStatus, CampaignType } from '../../common/interfaces/campaign.interface';
import { MetricType } from '../../common/interfaces/metric.interface';

// Mock implementations
jest.mock('../../services/campaign/models/campaign.model');
jest.mock('../../services/campaign/services/optimization.service');
jest.mock('../../services/campaign/services/targeting.service');

describe('Campaign Management Tests', () => {
    let campaignModel: jest.Mocked<CampaignModel>;
    let optimizationService: jest.Mocked<OptimizationService>;
    let targetingService: jest.Mocked<TargetingService>;

    const validCampaignData = {
        name: 'Test Campaign',
        type: CampaignType.OUTBOUND_CALL,
        status: CampaignStatus.DRAFT,
        configuration: {
            aiModel: 'gpt-4',
            complianceLevel: 'CCPA',
            geographicRules: {
                primaryMarket: 'California',
                allowedRegions: ['US-CA'],
                restrictions: ['CCPA_REQUIRED']
            }
        },
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-12-31'),
        complianceFields: {
            dataRetention: '12_MONTHS',
            privacyPolicy: 'CCPA_COMPLIANT',
            dataUsageConsent: true
        }
    };

    beforeEach(async () => {
        campaignModel = new CampaignModel() as jest.Mocked<CampaignModel>;
        optimizationService = new OptimizationService(
            campaignModel,
            null,
            null
        ) as jest.Mocked<OptimizationService>;
        targetingService = new TargetingService(
            campaignModel,
            null,
            null,
            null
        ) as jest.Mocked<TargetingService>;

        // Reset all mocks
        jest.clearAllMocks();
    });

    afterEach(() => {
        jest.resetAllMocks();
    });

    describe('Campaign Model Operations', () => {
        it('should create campaign with valid data and compliance fields', async () => {
            const campaign = new CampaignModel(validCampaignData);
            expect(campaign.validateDates()).resolves.toBe(true);
            expect(campaign.configuration.complianceLevel).toBe('CCPA');
            expect(campaign.configuration.geographicRules.primaryMarket).toBe('California');
        });

        it('should validate campaign dates correctly', async () => {
            const campaign = new CampaignModel(validCampaignData);
            await expect(campaign.validateDates()).resolves.toBe(true);

            campaign.startDate = new Date('2024-01-01');
            campaign.endDate = new Date('2023-12-31');
            await expect(campaign.validateDates()).rejects.toThrow('End date must be after start date');
        });

        it('should update campaign metrics within performance thresholds', async () => {
            const campaign = new CampaignModel(validCampaignData);
            const newMetrics = {
                engagement: {
                    impressions: 1000,
                    interactions: 200,
                    conversions: 50,
                    conversionRate: 0.25
                },
                revenue: {
                    generated: 10000,
                    projected: 25000,
                    roi: 2.5
                },
                quality: {
                    leadScore: 85,
                    responseRate: 0.4,
                    satisfactionScore: 0.9
                }
            };

            await campaign.updateMetrics(newMetrics);
            expect(campaign.metrics.engagement.conversionRate).toBe(0.25);
            expect(campaign.metrics.revenue.roi).toBe(2.5);
        });

        it('should enforce unique campaign names per organization', async () => {
            const campaign1 = new CampaignModel(validCampaignData);
            const campaign2 = new CampaignModel({
                ...validCampaignData,
                organizationId: campaign1.organizationId
            });

            await expect(campaign2.save()).rejects.toThrow('Campaign name must be unique');
        });
    });

    describe('Campaign Optimization Tests', () => {
        it('should optimize campaign based on AI recommendations', async () => {
            const optimizationConfig = {
                targetMetrics: [MetricType.CONVERSION_RATE, MetricType.REVENUE],
                optimizationInterval: 60,
                autoOptimize: true,
                confidenceThreshold: 0.85
            };

            const result = await optimizationService.optimizeCampaign('test-id', optimizationConfig);
            expect(result.success).toBe(true);
            expect(result.predictions).toBeDefined();
            expect(result.recommendations.length).toBeGreaterThan(0);
        });

        it('should analyze campaign performance within SLA', async () => {
            const startTime = Date.now();
            const performance = await optimizationService.analyzePerformance('test-id');
            const endTime = Date.now();

            expect(endTime - startTime).toBeLessThan(200); // 200ms SLA
            expect(performance.metrics).toBeDefined();
            expect(performance.trends).toBeDefined();
        });

        it('should validate performance metrics', async () => {
            const campaign = new CampaignModel(validCampaignData);
            const invalidMetrics = {
                engagement: {
                    impressions: -1,
                    interactions: 200,
                    conversions: 50,
                    conversionRate: 2.5 // Invalid: > 1
                }
            };

            await expect(campaign.updateMetrics(invalidMetrics)).rejects.toThrow('Invalid conversion rate');
        });
    });

    describe('Campaign Targeting Tests', () => {
        it('should analyze targeting effectiveness', async () => {
            const analysis = await targetingService.analyzeCampaignTargeting('test-id');
            expect(analysis.potentialReach).toBeGreaterThan(0);
            expect(analysis.qualifiedLeads).toBeGreaterThan(0);
            expect(analysis.mlConfidence).toBeGreaterThanOrEqual(0.85);
        });

        it('should update targeting criteria while maintaining compliance', async () => {
            const newCriteria = {
                industry: ['Technology'],
                companySize: ['Enterprise'],
                location: ['California'],
                budget: ['Enterprise'],
                interests: ['AI'],
                minScore: 70,
                ccpaCompliance: true,
                dataRetentionDays: 365,
                geographicRules: {
                    primaryMarket: 'California',
                    restrictions: ['CCPA_REQUIRED']
                },
                customRules: {}
            };

            const result = await targetingService.updateTargetingCriteria('test-id', newCriteria);
            expect(result).toBe(true);
        });

        it('should validate geographic restrictions', async () => {
            const invalidCriteria = {
                ...validCampaignData.configuration.geographicRules,
                allowedRegions: ['INVALID']
            };

            await expect(
                targetingService.validateGeographicRules(invalidCriteria)
            ).rejects.toThrow('Invalid geographic targeting rules');
        });

        it('should handle California-specific targeting rules', async () => {
            const campaign = new CampaignModel(validCampaignData);
            expect(campaign.configuration.geographicRules.primaryMarket).toBe('California');
            expect(campaign.configuration.complianceLevel).toBe('CCPA');
            expect(campaign.complianceFields.dataRetention).toBe('12_MONTHS');
        });
    });
});