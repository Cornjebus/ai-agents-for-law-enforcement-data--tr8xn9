import request from 'supertest'; // @version ^6.3.3
import { expect, beforeAll, afterAll, describe, it, jest } from 'jest'; // @version ^29.6.2
import { faker } from '@faker-js/faker'; // @version ^8.0.2
import createHttpError from 'http-errors'; // @version ^2.0.0
import { CampaignModel } from '../../services/campaign/models/campaign.model';
import { 
    Campaign,
    CampaignStatus,
    CampaignType,
    ContentPlatform,
    ContentType
} from '../../common/interfaces/campaign.interface';
import { MetricType, MetricUnit } from '../../common/interfaces/metric.interface';

// Mock services
jest.mock('../../services/ai/optimization.service');
jest.mock('../../services/metrics/metrics.service');

describe('Campaign Management E2E Tests', () => {
    let app: any;
    let testOrg: { id: string };
    let adminToken: string;
    let userToken: string;
    let testCampaign: Campaign;

    beforeAll(async () => {
        // Initialize test environment
        app = await require('../../app').default;
        
        // Set up test organization and users
        testOrg = await setupTestOrganization();
        adminToken = await generateAuthToken('ADMIN');
        userToken = await generateAuthToken('USER');
        
        // Initialize base test campaign
        testCampaign = await createTestCampaign();
    });

    afterAll(async () => {
        await cleanupTestData();
    });

    describe('Campaign Creation', () => {
        it('should create a campaign with valid data', async () => {
            const campaignData = generateCampaignData();
            
            const response = await request(app)
                .post('/api/v1/campaigns')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(campaignData)
                .expect(201);

            expect(response.body.id).toBeDefined();
            expect(response.body.status).toBe(CampaignStatus.DRAFT);
            expect(response.body.type).toBe(campaignData.type);
        });

        it('should validate campaign dates', async () => {
            const invalidDates = generateCampaignData({
                startDate: new Date(),
                endDate: new Date(Date.now() - 86400000) // Yesterday
            });

            await request(app)
                .post('/api/v1/campaigns')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(invalidDates)
                .expect(400);
        });

        it('should enforce budget constraints', async () => {
            const invalidBudget = generateCampaignData({
                budget: { totalBudget: -100, dailyLimit: 0 }
            });

            await request(app)
                .post('/api/v1/campaigns')
                .set('Authorization', `Bearer ${adminToken}`)
                .send(invalidBudget)
                .expect(400);
        });
    });

    describe('Campaign Optimization', () => {
        it('should trigger optimization on poor performance', async () => {
            const campaign = await createTestCampaign();
            
            const poorMetrics = {
                engagement: {
                    impressions: 1000,
                    interactions: 10,
                    conversions: 1,
                    conversionRate: 0.001
                },
                revenue: {
                    generated: 100,
                    projected: 1000,
                    roi: 0.1
                },
                quality: {
                    leadScore: 50,
                    responseRate: 0.05,
                    satisfactionScore: 60
                }
            };

            const response = await request(app)
                .put(`/api/v1/campaigns/${campaign.id}/metrics`)
                .set('Authorization', `Bearer ${adminToken}`)
                .send(poorMetrics)
                .expect(200);

            expect(response.body.optimizationTriggered).toBe(true);
        });

        it('should apply AI-driven optimizations', async () => {
            const campaign = await createTestCampaign();
            
            const response = await request(app)
                .post(`/api/v1/campaigns/${campaign.id}/optimize`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            expect(response.body.optimizations).toBeDefined();
            expect(response.body.aiConfidence).toBeGreaterThan(0.8);
        });
    });

    describe('Campaign Performance', () => {
        it('should handle concurrent metric updates', async () => {
            const campaign = await createTestCampaign();
            const updates = Array(10).fill(null).map(() => updateMetrics(campaign.id));
            
            const results = await Promise.all(updates);
            expect(results.every(r => r.status === 200)).toBe(true);
        });

        it('should maintain response time SLA', async () => {
            const campaign = await createTestCampaign();
            const startTime = Date.now();
            
            await request(app)
                .get(`/api/v1/campaigns/${campaign.id}`)
                .set('Authorization', `Bearer ${adminToken}`)
                .expect(200);

            const responseTime = Date.now() - startTime;
            expect(responseTime).toBeLessThan(200); // 200ms SLA
        });
    });

    describe('Security and Compliance', () => {
        it('should enforce authentication', async () => {
            await request(app)
                .get('/api/v1/campaigns')
                .expect(401);
        });

        it('should enforce organization isolation', async () => {
            const campaign = await createTestCampaign();
            const otherOrgToken = await generateAuthToken('ADMIN', 'other-org');
            
            await request(app)
                .get(`/api/v1/campaigns/${campaign.id}`)
                .set('Authorization', `Bearer ${otherOrgToken}`)
                .expect(403);
        });

        it('should validate RBAC permissions', async () => {
            const restrictedToken = await generateAuthToken('VIEWER');
            
            await request(app)
                .post('/api/v1/campaigns')
                .set('Authorization', `Bearer ${restrictedToken}`)
                .send(generateCampaignData())
                .expect(403);
        });
    });
});

// Helper Functions
async function setupTestOrganization() {
    return {
        id: faker.string.uuid(),
        name: faker.company.name(),
        settings: {
            aiEnabled: true,
            maxCampaigns: 10
        }
    };
}

async function generateAuthToken(role: string, orgId: string = testOrg.id): Promise<string> {
    // Implementation would integrate with your auth service
    return 'test-token';
}

function generateCampaignData(overrides: Partial<Campaign> = {}): Partial<Campaign> {
    return {
        name: faker.company.catchPhrase(),
        type: CampaignType.MULTI_CHANNEL,
        configuration: {
            channels: [ContentPlatform.LINKEDIN, ContentPlatform.VOICE],
            content: [{
                type: ContentType.TEXT,
                platform: ContentPlatform.LINKEDIN,
                content: faker.lorem.paragraph(),
                schedule: {
                    startTime: new Date(),
                    frequency: 'DAILY',
                    timezone: 'UTC'
                },
                variations: []
            }],
            schedule: {
                timezone: 'UTC',
                activeHours: {
                    start: '09:00',
                    end: '17:00',
                    days: [1, 2, 3, 4, 5]
                },
                throttling: {
                    maxPerHour: 100,
                    maxPerDay: 1000
                }
            },
            abTesting: {
                enabled: true,
                variants: ['A', 'B'],
                distributionRatio: [0.5, 0.5]
            },
            integrations: {
                crm: 'salesforce',
                analytics: ['google-analytics']
            }
        },
        budget: {
            totalBudget: 10000,
            dailyLimit: 500,
            currency: 'USD',
            costPerAction: {
                impression: 0.1,
                click: 1.0,
                conversion: 50.0
            },
            alerts: {
                thresholds: [0.5, 0.8, 0.9],
                notifications: ['email', 'slack']
            },
            optimization: {
                strategy: 'MAXIMIZE_ROI',
                constraints: {
                    minConversionRate: 0.02
                }
            }
        },
        targeting: {
            audience: {
                industries: ['Technology', 'SaaS'],
                companySize: ['50-200', '201-1000'],
                roles: ['CTO', 'VP Engineering'],
                geography: ['US', 'CA']
            },
            exclusions: {
                industries: ['Gaming'],
                domains: ['competitor.com']
            },
            customFilters: {},
            prioritization: {
                leadScore: 0.7,
                budget: 0.3
            }
        },
        ...overrides
    };
}

async function createTestCampaign(): Promise<Campaign> {
    const campaign = await CampaignModel.create(generateCampaignData());
    return campaign;
}

async function updateMetrics(campaignId: string) {
    return request(app)
        .put(`/api/v1/campaigns/${campaignId}/metrics`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
            engagement: {
                impressions: faker.number.int({ min: 100, max: 1000 }),
                interactions: faker.number.int({ min: 10, max: 100 }),
                conversions: faker.number.int({ min: 1, max: 10 }),
                conversionRate: faker.number.float({ min: 0.01, max: 0.1 })
            }
        });
}

async function cleanupTestData() {
    // Clean up test data after tests
    await CampaignModel.destroy({ where: { organizationId: testOrg.id } });
}