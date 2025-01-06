/**
 * @fileoverview Comprehensive test suite for useLeads hook with real-time updates,
 * AI scoring, and performance optimization testing
 * @version 1.0.0
 */

import { renderHook, act } from '@testing-library/react-hooks'; // v8.0.1
import { Provider } from 'react-redux'; // v8.1.0
import { jest } from '@jest/globals'; // v29.5.0
import { LeadService } from '../../src/services/lead.service';
import { useLeads } from '../../src/hooks/useLeads';
import { LeadStatus, ILead, IAIScore } from '../../src/types/lead';
import { UserRole } from '../../src/types/auth';
import { API_CONFIG } from '../../src/lib/constants';

// Mock dependencies
jest.mock('../../src/services/lead.service');
jest.mock('../../src/lib/auth', () => ({
  hasPermission: jest.fn().mockReturnValue(true)
}));

// Test data
const mockLeads: ILead[] = [
  {
    id: '1',
    organizationId: 'org1',
    campaignId: 'camp1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    phone: '+1234567890',
    company: 'TechCo',
    title: 'CEO',
    status: LeadStatus.NEW,
    source: 'OUTBOUND_CALL',
    score: 85,
    aiScore: {
      overall: 0.85,
      engagement: 0.9,
      intent: 0.8,
      budget: 0.85,
      lastUpdated: new Date()
    },
    metadata: {},
    interactions: [],
    nextActions: [],
    createdAt: new Date(),
    updatedAt: new Date()
  }
];

// Mock store
const mockStore = {
  getState: () => ({
    auth: {
      user: { role: UserRole.MANAGER }
    }
  }),
  dispatch: jest.fn(),
  subscribe: jest.fn()
};

describe('useLeads Hook', () => {
  let mockLeadService: jest.Mocked<LeadService>;
  let mockWebSocket: WebSocket;

  beforeEach(() => {
    jest.useFakeTimers();
    mockLeadService = new LeadService(null) as jest.Mocked<LeadService>;
    mockWebSocket = new WebSocket('ws://localhost');

    // Setup mock implementations
    mockLeadService.getLeadsWithAIScore.mockResolvedValue({
      data: mockLeads,
      total: 1,
      aiInsights: { recommendedActions: [] }
    });

    mockLeadService.updateAIScore.mockResolvedValue({
      overall: 0.9,
      engagement: 0.95,
      intent: 0.85,
      budget: 0.9,
      lastUpdated: new Date()
    });

    mockLeadService.batchUpdateLeads.mockResolvedValue({
      success: true,
      updatedCount: 1,
      failedIds: [],
      errors: {}
    });

    // Setup performance monitoring
    jest.spyOn(performance, 'now');
    jest.spyOn(performance, 'mark');
    jest.spyOn(performance, 'measure');
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
  });

  it('should initialize with loading state and fetch leads', async () => {
    const { result, waitForNextUpdate } = renderHook(() => useLeads(), {
      wrapper: ({ children }) => (
        <Provider store={mockStore}>{children}</Provider>
      )
    });

    expect(result.current.loading).toBe(true);
    expect(result.current.leads).toEqual([]);

    await waitForNextUpdate();

    expect(result.current.loading).toBe(false);
    expect(result.current.leads).toEqual(mockLeads);
    expect(result.current.totalLeads).toBe(1);
  });

  it('should handle real-time updates efficiently', async () => {
    const { result, waitForNextUpdate } = renderHook(() => useLeads(), {
      wrapper: ({ children }) => (
        <Provider store={mockStore}>{children}</Provider>
      )
    });

    await waitForNextUpdate();

    // Simulate real-time update
    const updatedLead = { ...mockLeads[0], score: 90 };
    await act(async () => {
      mockLeadService.getLeadUpdates().next(updatedLead);
    });

    expect(result.current.leads[0].score).toBe(90);
    expect(result.current.realTimeStatus).toBe('CONNECTED');
  });

  it('should optimize performance with caching', async () => {
    performance.mark('cache-test-start');

    const { result, waitForNextUpdate } = renderHook(() => useLeads(), {
      wrapper: ({ children }) => (
        <Provider store={mockStore}>{children}</Provider>
      )
    });

    await waitForNextUpdate();

    // Second render should use cache
    const { result: result2 } = renderHook(() => useLeads());
    
    performance.mark('cache-test-end');
    performance.measure('cache-performance', 'cache-test-start', 'cache-test-end');

    const perfMeasure = performance.getEntriesByName('cache-performance')[0];
    expect(perfMeasure.duration).toBeLessThan(API_CONFIG.TIMEOUT);
  });

  it('should handle AI score updates efficiently', async () => {
    const { result, waitForNextUpdate } = renderHook(() => useLeads(), {
      wrapper: ({ children }) => (
        <Provider store={mockStore}>{children}</Provider>
      )
    });

    await waitForNextUpdate();

    // Update AI score
    await act(async () => {
      await result.current.updateAIScore('1');
    });

    expect(mockLeadService.updateAIScore).toHaveBeenCalledWith('1');
    expect(mockStore.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        type: expect.any(String),
        payload: expect.any(Object)
      })
    );
  });

  it('should handle batch operations with optimized performance', async () => {
    const { result, waitForNextUpdate } = renderHook(() => useLeads(), {
      wrapper: ({ children }) => (
        <Provider store={mockStore}>{children}</Provider>
      )
    });

    await waitForNextUpdate();

    // Test batch selection
    act(() => {
      result.current.batchOperations.selectAll();
    });

    expect(result.current.batchOperations.selectedLeads.size).toBe(1);

    // Test batch update
    await act(async () => {
      await result.current.batchOperations.updateSelected({ status: LeadStatus.QUALIFIED });
    });

    expect(mockLeadService.batchUpdateLeads).toHaveBeenCalledWith(
      expect.arrayContaining([
        expect.objectContaining({
          id: '1',
          status: LeadStatus.QUALIFIED
        })
      ]),
      expect.any(Object)
    );
  });

  it('should maintain performance under load', async () => {
    // Generate large dataset
    const largeDataset = Array.from({ length: 1000 }, (_, i) => ({
      ...mockLeads[0],
      id: `lead-${i}`
    }));

    mockLeadService.getLeadsWithAIScore.mockResolvedValueOnce({
      data: largeDataset,
      total: largeDataset.length,
      aiInsights: { recommendedActions: [] }
    });

    performance.mark('load-test-start');

    const { result, waitForNextUpdate } = renderHook(() => useLeads(), {
      wrapper: ({ children }) => (
        <Provider store={mockStore}>{children}</Provider>
      )
    });

    await waitForNextUpdate();

    performance.mark('load-test-end');
    performance.measure('load-performance', 'load-test-start', 'load-test-end');

    const perfMeasure = performance.getEntriesByName('load-performance')[0];
    expect(perfMeasure.duration).toBeLessThan(API_CONFIG.TIMEOUT);
    expect(result.current.leads.length).toBe(1000);
  });
});