import { jest } from '@testing-library/jest-dom';
import { renderHook } from '@testing-library/react-hooks';
import { rest } from 'msw';
import { setupServer } from 'msw/node';
import { faker } from '@faker-js/faker';
import { LeadService } from '../../src/services/lead.service';
import { ApiClient } from '../../src/lib/api';
import { LeadStatus, LeadSource, ILead, IAIScore, INextAction } from '../../src/types/lead';
import { CampaignType } from '../../src/types/campaign';

// Mock API client
jest.mock('../../src/lib/api');
const mockApiClient = jest.mocked(ApiClient);

// MSW server setup for API mocking
const server = setupServer();

// Test data generators
const generateMockLead = (): ILead => ({
  id: faker.string.uuid(),
  organizationId: faker.string.uuid(),
  campaignId: faker.string.uuid(),
  firstName: faker.person.firstName(),
  lastName: faker.person.lastName(),
  email: faker.internet.email(),
  phone: faker.phone.number(),
  company: faker.company.name(),
  title: faker.person.jobTitle(),
  status: LeadStatus.NEW,
  source: LeadSource.OUTBOUND_CALL,
  score: faker.number.int({ min: 0, max: 100 }),
  aiScore: {
    overall: faker.number.float({ min: 0, max: 1 }),
    engagement: faker.number.float({ min: 0, max: 1 }),
    intent: faker.number.float({ min: 0, max: 1 }),
    budget: faker.number.float({ min: 0, max: 1 }),
    lastUpdated: new Date()
  },
  metadata: {
    industry: faker.company.buzzPhrase(),
    companySize: faker.helpers.arrayElement(['1-10', '11-50', '51-200', '201-500']),
    budget: faker.finance.amount(),
    aiEnrichment: {
      predictedRevenue: faker.number.int({ min: 10000, max: 1000000 }),
      churnRisk: faker.number.float({ min: 0, max: 1 })
    }
  },
  interactions: [],
  nextActions: [],
  createdAt: new Date(),
  updatedAt: new Date()
});

describe('LeadService', () => {
  let leadService: LeadService;
  let mockLeads: ILead[];

  beforeAll(() => {
    server.listen();
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    leadService = new LeadService(new ApiClient());
    mockLeads = Array.from({ length: 5 }, generateMockLead);
  });

  describe('Lead CRUD Operations', () => {
    test('getLeadsWithAIScore should fetch and cache leads with AI scores', async () => {
      // Setup mock response
      const mockResponse = {
        data: mockLeads,
        total: mockLeads.length,
        aiInsights: {
          averageScore: 0.75,
          recommendations: ['Increase follow-up frequency']
        }
      };

      mockApiClient.prototype.get.mockResolvedValueOnce({ data: mockResponse });

      // Test with filters
      const filters = {
        status: [LeadStatus.NEW],
        scoreRange: { min: 0.5, max: 1 },
        campaignId: faker.string.uuid()
      };
      const pagination = { page: 1, limit: 10 };

      const result = await leadService.getLeadsWithAIScore(filters, pagination, true);

      expect(result).toEqual(mockResponse);
      expect(mockApiClient.prototype.get).toHaveBeenCalledTimes(1);
      expect(mockApiClient.prototype.get).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/leads')
      );

      // Test cache hit
      const cachedResult = await leadService.getLeadsWithAIScore(filters, pagination, true);
      expect(cachedResult).toEqual(mockResponse);
      expect(mockApiClient.prototype.get).toHaveBeenCalledTimes(1);
    });

    test('batchUpdateLeads should handle large batches correctly', async () => {
      const updateData = mockLeads.map(lead => ({
        id: lead.id,
        status: LeadStatus.QUALIFIED,
        aiScore: {
          overall: faker.number.float({ min: 0, max: 1 })
        }
      }));

      const mockResponse = {
        updatedCount: updateData.length,
        updatedLeads: updateData,
        failedIds: [],
        errors: {}
      };

      mockApiClient.prototype.post.mockResolvedValueOnce({ data: mockResponse });

      const result = await leadService.batchUpdateLeads(updateData, {
        refreshCache: true,
        notifyUpdates: true
      });

      expect(result.success).toBe(true);
      expect(result.updatedCount).toBe(updateData.length);
      expect(result.failedIds).toHaveLength(0);
    });
  });

  describe('AI Scoring and Recommendations', () => {
    test('updateAIScore should calculate new score and invalidate cache', async () => {
      const leadId = faker.string.uuid();
      const mockScore: IAIScore = {
        overall: 0.85,
        engagement: 0.9,
        intent: 0.8,
        budget: 0.85,
        lastUpdated: new Date()
      };

      mockApiClient.prototype.post.mockResolvedValueOnce({ data: mockScore });

      const result = await leadService.updateAIScore(leadId);

      expect(result).toEqual(mockScore);
      expect(mockApiClient.prototype.post).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v1/leads/${leadId}/score`)
      );
    });

    test('getNextActions should return AI-recommended actions', async () => {
      const leadId = faker.string.uuid();
      const mockActions: INextAction[] = [{
        id: faker.string.uuid(),
        type: 'FOLLOW_UP_CALL',
        priority: 1,
        suggestedContent: 'Discuss budget requirements',
        dueDate: new Date()
      }];

      mockApiClient.prototype.get.mockResolvedValueOnce({ data: mockActions });

      const result = await leadService.getNextActions(leadId);

      expect(result).toEqual(mockActions);
      expect(mockApiClient.prototype.get).toHaveBeenCalledWith(
        expect.stringContaining(`/api/v1/leads/${leadId}/next-actions`)
      );
    });
  });

  describe('Real-time Updates', () => {
    test('getLeadUpdates should emit real-time updates', (done) => {
      const mockUpdate = generateMockLead();
      
      // Setup subscription to updates
      const subscription = leadService.getLeadUpdates().subscribe(updates => {
        expect(updates).toContainEqual(mockUpdate);
        subscription.unsubscribe();
        done();
      });

      // Simulate real-time update
      mockApiClient.prototype.get.mockResolvedValueOnce({
        data: [mockUpdate]
      });

      // Trigger update fetch
      leadService['fetchRealtimeUpdates']();
    });

    test('should cleanup resources on destroy', () => {
      const unsubscribeSpy = jest.spyOn(leadService['updateSubscription'], 'unsubscribe');
      const completeSpy = jest.spyOn(leadService['leadUpdates$'], 'complete');

      leadService.destroy();

      expect(unsubscribeSpy).toHaveBeenCalled();
      expect(completeSpy).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle API errors gracefully', async () => {
      const error = new Error('API Error');
      mockApiClient.prototype.get.mockRejectedValueOnce(error);

      await expect(
        leadService.getLeadsWithAIScore({}, { page: 1, limit: 10 })
      ).rejects.toThrow('API Error');
    });

    test('should handle cache errors', async () => {
      // Corrupt cache
      jest.spyOn(leadService['cacheManager'], 'get').mockRejectedValueOnce(new Error('Cache Error'));

      const filters = { status: [LeadStatus.NEW] };
      const pagination = { page: 1, limit: 10 };

      // Should fallback to API call
      mockApiClient.prototype.get.mockResolvedValueOnce({
        data: { leads: mockLeads, total: mockLeads.length }
      });

      const result = await leadService.getLeadsWithAIScore(filters, pagination, true);
      expect(result.data).toHaveLength(mockLeads.length);
    });
  });
});