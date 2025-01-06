import { renderHook, act } from '@testing-library/react-hooks'; // v8.0.1
import { Provider } from 'react-redux'; // v8.1.0
import { configureStore } from '@reduxjs/toolkit'; // v1.9.5
import { describe, it, expect, beforeEach, jest } from '@jest/globals'; // v29.5.0
import MockWebSocket from 'jest-websocket-mock'; // v2.4.0

import { useCampaign } from '../../src/hooks/useCampaign';
import { CampaignType, CampaignStatus } from '../../src/types/campaign';
import { UserRole } from '../../src/types/auth';
import { API_CONFIG, AI_CONFIG } from '../../src/lib/constants';
import { hasPermission } from '../../src/lib/auth';

// Mock dependencies
jest.mock('../../src/lib/auth', () => ({
  hasPermission: jest.fn()
}));

// Enhanced mock campaign data
const mockCampaign = {
  id: 'test-campaign-id',
  name: 'Test Campaign',
  type: CampaignType.OUTBOUND_CALL,
  status: CampaignStatus.ACTIVE,
  config: {
    aiConfig: {
      model: AI_CONFIG.LLM_SETTINGS.model,
      temperature: AI_CONFIG.LLM_SETTINGS.temperature,
      maxTokens: AI_CONFIG.LLM_SETTINGS.maxTokens,
      voice: AI_CONFIG.VOICE_SYNTHESIS
    },
    optimization: {
      enabled: true,
      target: 'conversion_rate',
      strategy: 'balanced',
      constraints: {
        minROAS: 2.5,
        maxCPA: 50
      }
    }
  },
  metrics: {
    revenue: 10000,
    cost: 2000,
    roas: 5,
    leads: 100,
    conversions: 20,
    conversionRate: 0.2,
    aiMetrics: {
      responseTime: 150,
      accuracy: 0.92,
      optimizationScore: 0.85,
      confidenceLevel: 0.88
    },
    realTimeMetrics: {
      activeLeads: 25,
      queuedTasks: 5,
      processingRate: 10,
      errorRate: 0.02
    }
  }
};

// Test setup helper
const setupTest = () => {
  // Create mock store
  const store = configureStore({
    reducer: {
      campaigns: (state = { campaigns: { [mockCampaign.id]: mockCampaign } }) => state
    }
  });

  // Create mock WebSocket server
  const wsServer = new MockWebSocket(`${API_CONFIG.BASE_URL}/campaign-updates`);

  // Create wrapper with providers
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  return { store, wsServer, wrapper };
};

describe('useCampaign Hook', () => {
  let wsServer: MockWebSocket;

  beforeEach(() => {
    // Reset mocks and permissions
    jest.clearAllMocks();
    (hasPermission as jest.Mock).mockReturnValue(true);
    wsServer?.close();
  });

  describe('Campaign Management', () => {
    it('should initialize with campaign data and verify permissions', async () => {
      const { wrapper } = setupTest();
      
      const { result } = renderHook(() => useCampaign(mockCampaign.id), { wrapper });

      expect(hasPermission).toHaveBeenCalledWith(UserRole.MANAGER);
      expect(result.current.campaign).toEqual(mockCampaign);
      expect(result.current.loading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should handle campaign fetch errors gracefully', async () => {
      const { wrapper } = setupTest();
      const errorMessage = 'Failed to fetch campaign';
      
      jest.spyOn(console, 'error').mockImplementation(() => {});
      
      const { result } = renderHook(() => useCampaign('invalid-id'), { wrapper });

      expect(result.current.error).toBe(errorMessage);
      expect(result.current.loading).toBe(false);
    });

    it('should enforce permission controls', async () => {
      (hasPermission as jest.Mock).mockReturnValue(false);
      const { wrapper } = setupTest();
      
      const { result } = renderHook(() => useCampaign(mockCampaign.id), { wrapper });

      expect(result.current.campaign).toBeNull();
      expect(result.current.error).toContain('permission');
    });
  });

  describe('Real-time Updates', () => {
    it('should establish WebSocket connection and handle updates', async () => {
      const { wrapper, wsServer } = setupTest();
      
      const { result } = renderHook(() => useCampaign(mockCampaign.id), { wrapper });

      await wsServer.connected;

      const metricUpdate = {
        activeLeads: 30,
        conversions: 25,
        revenue: 12000
      };

      act(() => {
        wsServer.send(JSON.stringify({ type: 'metrics_update', data: metricUpdate }));
      });

      expect(result.current.metrics).toMatchObject(expect.objectContaining(metricUpdate));
    });

    it('should handle WebSocket connection errors', async () => {
      const { wrapper, wsServer } = setupTest();
      
      const { result } = renderHook(() => useCampaign(mockCampaign.id), { wrapper });

      await wsServer.connected;
      wsServer.error();

      expect(result.current.error).toContain('WebSocket');
    });

    it('should reconnect automatically after disconnection', async () => {
      const { wrapper, wsServer } = setupTest();
      
      renderHook(() => useCampaign(mockCampaign.id), { wrapper });

      await wsServer.connected;
      wsServer.close();
      await wsServer.connected;

      expect(wsServer.server.clients().length).toBe(1);
    });
  });

  describe('AI Optimization', () => {
    it('should trigger AI optimization with correct parameters', async () => {
      const { wrapper } = setupTest();
      
      const { result } = renderHook(() => useCampaign(mockCampaign.id), { wrapper });

      await act(async () => {
        await result.current.actions.optimize();
      });

      expect(result.current.optimization.inProgress).toBe(false);
      expect(result.current.optimization.lastOptimized).toBeTruthy();
      expect(result.current.optimization.score).toBeGreaterThan(0);
    });

    it('should handle AI optimization errors gracefully', async () => {
      const { wrapper } = setupTest();
      const errorMessage = 'AI optimization failed';
      
      jest.spyOn(console, 'error').mockImplementation(() => {});
      
      const { result } = renderHook(() => useCampaign(mockCampaign.id), { wrapper });

      await act(async () => {
        await result.current.actions.optimize();
      });

      expect(result.current.optimization.error).toBe(errorMessage);
      expect(result.current.optimization.inProgress).toBe(false);
    });
  });

  describe('Performance Requirements', () => {
    it('should meet loading time thresholds', async () => {
      const startTime = performance.now();
      const { wrapper } = setupTest();
      
      const { result } = renderHook(() => useCampaign(mockCampaign.id), { wrapper });
      const loadTime = performance.now() - startTime;

      expect(loadTime).toBeLessThan(200); // 200ms threshold
      expect(result.current.loading).toBe(false);
    });

    it('should optimize render cycles for metric updates', async () => {
      const { wrapper, wsServer } = setupTest();
      const renderSpy = jest.fn();
      
      const { result } = renderHook(() => {
        renderSpy();
        return useCampaign(mockCampaign.id);
      }, { wrapper });

      await wsServer.connected;

      // Simulate rapid metric updates
      for (let i = 0; i < 10; i++) {
        act(() => {
          wsServer.send(JSON.stringify({
            type: 'metrics_update',
            data: { activeLeads: 30 + i }
          }));
        });
      }

      // Should batch updates and limit renders
      expect(renderSpy).toHaveBeenCalledTimes(3);
    });
  });
});