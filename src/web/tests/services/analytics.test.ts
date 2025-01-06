/**
 * @fileoverview Comprehensive test suite for AnalyticsService
 * Version: 1.0.0
 */

import { jest } from '@jest/globals'; // v29.6.0
import { io } from 'socket.io-client'; // v4.7.1
import fetchMock from 'jest-fetch-mock'; // v3.0.3

import { AnalyticsService } from '../../src/services/analytics.service';
import { ApiClient } from '../../src/lib/api';
import { MetricType, TimeRange } from '../../src/types/analytics';
import { ANALYTICS_CONFIG } from '../../src/lib/constants';

// Mock socket.io-client
jest.mock('socket.io-client');

// Mock performance API
const mockPerformanceNow = jest.fn();
global.performance.now = mockPerformanceNow;

describe('AnalyticsService', () => {
  let analyticsService: AnalyticsService;
  let mockApiClient: jest.Mocked<ApiClient>;
  let mockSocket: any;

  // Mock dashboard data for testing
  const MOCK_DASHBOARD_DATA = {
    metrics: [
      {
        id: 'revenue',
        type: MetricType.REVENUE,
        value: 124500,
        previousValue: 108260,
        changePercentage: 15,
        timestamp: new Date(),
        threshold: ANALYTICS_CONFIG.PERFORMANCE_THRESHOLDS[MetricType.REVENUE],
        status: 'normal'
      },
      {
        id: 'conversion',
        type: MetricType.CONVERSION_RATE,
        value: 0.23,
        previousValue: 0.25,
        changePercentage: -2,
        timestamp: new Date(),
        threshold: ANALYTICS_CONFIG.PERFORMANCE_THRESHOLDS[MetricType.CONVERSION_RATE],
        status: 'warning'
      }
    ],
    charts: {
      [MetricType.REVENUE]: {
        labels: ['Jan', 'Feb', 'Mar'],
        datasets: [{
          label: 'Revenue',
          data: [100000, 110000, 124500],
          color: ANALYTICS_CONFIG.CHART_COLORS[MetricType.REVENUE]
        }],
        type: MetricType.REVENUE,
        thresholds: [{
          value: 100000,
          label: 'Target',
          color: '#FF0000'
        }]
      }
    },
    summary: {
      totalRevenue: 124500,
      conversionRate: 0.23,
      activeLeads: 1245,
      aiEfficiency: 0.87
    },
    performance: {
      apiLatency: 150,
      voiceProcessingTime: 250,
      errorRate: 0.01
    }
  };

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    fetchMock.resetMocks();
    mockPerformanceNow.mockReturnValue(0);

    // Mock API client
    mockApiClient = {
      request: jest.fn(),
      getCircuitState: jest.fn(),
      clearCache: jest.fn()
    } as any;

    // Mock Socket.IO
    mockSocket = {
      on: jest.fn(),
      emit: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn()
    };
    (io as jest.Mock).mockReturnValue(mockSocket);

    // Initialize service
    analyticsService = new AnalyticsService(mockApiClient);
  });

  afterEach(() => {
    analyticsService.dispose();
  });

  describe('Dashboard Data Fetching', () => {
    it('should fetch dashboard data with correct parameters', async () => {
      mockApiClient.request.mockResolvedValueOnce(MOCK_DASHBOARD_DATA);
      mockPerformanceNow.mockReturnValueOnce(0).mockReturnValueOnce(150);

      const filter = {
        timeRange: TimeRange.LAST_30_DAYS,
        startDate: null,
        endDate: null,
        metricTypes: [MetricType.REVENUE, MetricType.CONVERSION_RATE],
        campaignId: null,
        refreshInterval: 30000
      };

      const result = await analyticsService.getDashboardData(filter);

      expect(mockApiClient.request).toHaveBeenCalledWith(
        'POST',
        '/api/v1/analytics/dashboard',
        { data: JSON.stringify(filter) }
      );
      expect(result).toEqual(MOCK_DASHBOARD_DATA);
    });

    it('should handle custom date range with compression', async () => {
      mockApiClient.request.mockResolvedValueOnce(MOCK_DASHBOARD_DATA);

      const filter = {
        timeRange: TimeRange.CUSTOM,
        startDate: new Date('2023-01-01'),
        endDate: new Date('2023-12-31'),
        metricTypes: [MetricType.REVENUE],
        campaignId: null,
        refreshInterval: 30000
      };

      await analyticsService.getDashboardData(filter);

      expect(mockApiClient.request).toHaveBeenCalledWith(
        'POST',
        '/api/v1/analytics/dashboard',
        expect.objectContaining({
          data: expect.any(String) // Compressed data
        })
      );
    });

    it('should throw error when API request fails', async () => {
      const error = new Error('API Error');
      mockApiClient.request.mockRejectedValueOnce(error);

      const filter = {
        timeRange: TimeRange.LAST_7_DAYS,
        startDate: null,
        endDate: null,
        metricTypes: [MetricType.REVENUE],
        campaignId: null,
        refreshInterval: 30000
      };

      await expect(analyticsService.getDashboardData(filter)).rejects.toThrow('API Error');
    });
  });

  describe('Real-time Updates', () => {
    it('should handle real-time metric updates correctly', () => {
      const mockCallback = jest.fn();
      const mockMetricUpdate = {
        id: 'revenue_rt',
        type: MetricType.REVENUE,
        value: 125000,
        previousValue: 124500,
        changePercentage: 0.4,
        timestamp: new Date(),
        threshold: ANALYTICS_CONFIG.PERFORMANCE_THRESHOLDS[MetricType.REVENUE],
        status: 'normal'
      };

      // Subscribe to updates
      analyticsService.subscribeToUpdates(mockCallback);

      // Simulate metric update
      const socketCallback = mockSocket.on.mock.calls.find(
        call => call[0] === 'metrics_update'
      )[1];
      socketCallback(JSON.stringify(mockMetricUpdate));

      expect(mockCallback).toHaveBeenCalledWith([mockMetricUpdate]);
    });

    it('should handle WebSocket reconnection', () => {
      const mockCallback = jest.fn();
      analyticsService.subscribeToUpdates(mockCallback);

      // Simulate disconnect
      const disconnectCallback = mockSocket.on.mock.calls.find(
        call => call[0] === 'disconnect'
      )[1];
      disconnectCallback();

      // Verify reconnection attempt
      expect(io).toHaveBeenCalledTimes(2);
    });

    it('should unsubscribe from updates correctly', () => {
      const mockCallback = jest.fn();
      const unsubscribe = analyticsService.subscribeToUpdates(mockCallback);

      unsubscribe();

      // Simulate metric update
      const socketCallback = mockSocket.on.mock.calls.find(
        call => call[0] === 'metrics_update'
      )[1];
      socketCallback(JSON.stringify({ id: 'test' }));

      expect(mockCallback).not.toHaveBeenCalled();
    });
  });

  describe('Performance Monitoring', () => {
    it('should monitor API response times', async () => {
      mockApiClient.request.mockResolvedValueOnce(MOCK_DASHBOARD_DATA);
      mockPerformanceNow
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(2100); // Simulate slow response

      const filter = {
        timeRange: TimeRange.TODAY,
        startDate: null,
        endDate: null,
        metricTypes: [MetricType.REVENUE],
        campaignId: null,
        refreshInterval: 30000
      };

      await analyticsService.getDashboardData(filter);

      // Verify performance monitoring event was emitted
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            type: 'performance',
            duration: 2100
          })
        })
      );
    });

    it('should track real-time update processing time', () => {
      const mockCallback = jest.fn();
      mockPerformanceNow
        .mockReturnValueOnce(0)
        .mockReturnValueOnce(150);

      analyticsService.subscribeToUpdates(mockCallback);

      const socketCallback = mockSocket.on.mock.calls.find(
        call => call[0] === 'metrics_update'
      )[1];

      const mockMetric = {
        id: 'test',
        type: MetricType.REVENUE,
        value: 100000
      };

      socketCallback(JSON.stringify(mockMetric));

      expect(mockPerformanceNow).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should handle invalid metric data', () => {
      const mockCallback = jest.fn();
      analyticsService.subscribeToUpdates(mockCallback);

      const socketCallback = mockSocket.on.mock.calls.find(
        call => call[0] === 'metrics_update'
      )[1];

      // Invalid metric data
      const invalidMetric = JSON.stringify({ id: 'test' });

      expect(() => socketCallback(invalidMetric)).toThrow('Invalid metric data received');
      expect(mockCallback).not.toHaveBeenCalled();
    });

    it('should handle WebSocket connection errors', () => {
      const errorCallback = mockSocket.on.mock.calls.find(
        call => call[0] === 'error'
      )[1];

      const mockError = new Error('Connection failed');
      errorCallback(mockError);

      // Verify error handling
      expect(window.dispatchEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          detail: expect.objectContaining({
            type: 'websocket_error',
            error: mockError
          })
        })
      );
    });
  });
});